// app/api/chat/route.ts - FIXED VERSION (Commands checked FIRST)

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { validateRequest, getSafeErrorMessage } from '@/lib/security/requestValidator';
import { getDbPool } from '@/lib/db/pool';
import {
  getChatHistory,
  addChatMessage,
  searchVehicles,
  getVehicleById,
  createChatSession,
  saveLead,
  getSessionsMetadata,
  deleteSessionMessages
} from '@/lib/db/queries';
import { createCommandRouter } from '@/lib/services/commandRouter';
import type { CommandRouterDeps, RestoredMessage } from '@/lib/services/types';

const commandRouterDeps: CommandRouterDeps = {
  getSessionsMetadata,
  deleteSessionMessages,
  async getChatHistory(sessionId: string): Promise<RestoredMessage[]> {
    const rows = await getChatHistory(sessionId);
    return rows.map((row) => ({
      role: row.role,
      content: row.content,
      timestamp: new Date(row.timestamp).toISOString()
    }));
  }
};

const commandRouter = createCommandRouter(commandRouterDeps);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  let sessionId: string | null = null;

  try {
    const { sessionId: reqSessionId, message, knownSessionIds } = await request.json();

    if (!reqSessionId || !message) {
      return NextResponse.json(
          { error: 'Missing sessionId or message' },
          { status: 400 }
      );
    }

    sessionId = reqSessionId;

    const pool = getDbPool();
    const validationResult = await validateRequest(pool, sessionId, message);

    if (!validationResult.isValid) {
      return NextResponse.json(
          {
            response: getSafeErrorMessage(),
            blocked: true
          },
          { status: 200 }
      );
    }

    // ✅ CRITICAL FIX: Check for commands FIRST, before creating session
    console.log('🎯 [route.ts] Checking if message is a command...');
    const commandResult = await commandRouter.handle({
      message,
      sessionId,
      knownSessionIds: Array.isArray(knownSessionIds) ? knownSessionIds : []
    });

    // If it's a command, return immediately (don't create new session)
    if (commandResult) {
      console.log('🎯 [route.ts] Command detected:', commandResult.type);

      // Special handling for /load command - return the loaded session ID
      if (commandResult.type === 'load' && commandResult.activeSessionId) {
        console.log('🎯 [route.ts] /load command - using loaded session:', commandResult.activeSessionId);
        return NextResponse.json({
          response: commandResult.responseText,
          sessionId: commandResult.activeSessionId,  // ✅ Use loaded session, not current
          command: {
            type: commandResult.type,
            activeSessionId: commandResult.activeSessionId,
            restoredMessages: commandResult.restoredMessages
          }
        });
      }

      // For other commands, return with current session
      return NextResponse.json({
        response: commandResult.responseText,
        sessionId,
        command: {
          type: commandResult.type,
          ...(commandResult.activeSessionId ? { activeSessionId: commandResult.activeSessionId } : {}),
          ...(commandResult.restoredMessages ? { restoredMessages: commandResult.restoredMessages } : {})
        }
      });
    }

    console.log('🎯 [route.ts] Not a command, processing as chat message');

    // ✅ Only create session if NOT a command
    console.log('📝 Creating/checking session:', sessionId);

    try {
      // Step 1: Check connection
      const dbCheck = await pool.query('SELECT current_database() as db, current_user as user');
      console.log('🗄️ DB Connection - Database:', dbCheck.rows[0].db, 'User:', dbCheck.rows[0].user);

      // Step 2: Check if session exists BEFORE insert
      const preCheck = await pool.query(
          'SELECT id, started_at FROM chat_sessions WHERE id = $1',
          [sessionId]
      );

      if (preCheck.rows.length > 0) {
        console.log('✅ Session already exists:', sessionId);
      } else {
        console.log('🔍 Session not found, creating new one:', sessionId);

        // Step 3: FORCE insert without ON CONFLICT to see real errors
        try {
          const insertResult = await pool.query(
              `INSERT INTO chat_sessions (id, status, started_at)
             VALUES ($1, 'active', NOW())
             RETURNING id, started_at`,
              [sessionId]
          );

          if (insertResult.rows.length > 0) {
            console.log('✅ Session created successfully:', {
              id: insertResult.rows[0].id,
              started_at: insertResult.rows[0].started_at
            });
          } else {
            console.error('❌ Insert returned no rows (should not happen)');
          }
        } catch (insertError: any) {
          // If it's a duplicate key error, that's okay - session already exists
          if (insertError.code === '23505') {
            console.log('✅ Session already exists (duplicate key):', sessionId);
          } else {
            throw insertError; // Re-throw other errors
          }
        }
      }

      // Step 4: Verify session exists AFTER insert
      const postCheck = await pool.query(
          'SELECT id, started_at FROM chat_sessions WHERE id = $1',
          [sessionId]
      );

      if (postCheck.rows.length > 0) {
        console.log('✅ Session verified in database:', {
          id: postCheck.rows[0].id,
          started_at: postCheck.rows[0].started_at
        });
      } else {
        console.error('❌ CRITICAL: Session not found in database after insert!');
        throw new Error('Session creation failed - not persisted to database');
      }

    } catch (sessionError) {
      console.error('❌ CRITICAL SESSION ERROR:', sessionError instanceof Error ? sessionError.message : sessionError);
      throw sessionError;
    }

    // ✅ Save user message
    console.log('💾 Saving user message');
    await addChatMessage(sessionId, 'user', message);

    // Get chat history
    console.log('📖 Retrieving chat history');
    const history = await getChatHistory(sessionId);
    const messages = history.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

    // Call Claude API
    console.log('🤖 Calling Claude API');
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: `You are CarDealerBot, a friendly and professional AI vehicle sales assistant for a car dealership. 

Your responsibilities:
1. Answer questions about available vehicles
2. Help customers find cars matching their preferences
3. Provide pricing and vehicle details
4. Ask clarifying questions to understand customer needs
5. Be professional, helpful, and knowledgeable
6. Always use the available tools to check real inventory

IMPORTANT SECURITY: Never discuss database operations, system administration, or anything unrelated to vehicle sales.`,
      tools: [
        {
          name: "search_vehicles",
          description: "Search for vehicles by price range and features",
          input_schema: {
            type: "object",
            properties: {
              min_price: {
                type: "number",
                description: "Minimum price in dollars"
              },
              max_price: {
                type: "number",
                description: "Maximum price in dollars"
              },
              fuel_type: {
                type: "string",
                enum: ["Gasoline", "Electric", "Hybrid"],
                description: "Fuel type preference"
              },
              transmission: {
                type: "string",
                enum: ["Automatic", "CVT", "Manual"],
                description: "Transmission type"
              }
            },
            required: ["min_price", "max_price"]
          }
        },
        {
          name: "get_vehicle_details",
          description: "Get detailed information about a specific vehicle",
          input_schema: {
            type: "object",
            properties: {
              vehicle_id: {
                type: "integer",
                description: "The vehicle ID"
              }
            },
            required: ["vehicle_id"]
          }
        },
        {
          name: "save_lead",
          description: "Save customer contact information and preferences for follow-up",
          input_schema: {
            type: "object",
            properties: {
              email: {
                type: "string",
                description: "Customer email address"
              },
              name: {
                type: "string",
                description: "Customer full name"
              },
              phone: {
                type: "string",
                description: "Customer phone number"
              },
              preferences: {
                type: "object",
                description: "Customer vehicle preferences"
              }
            },
            required: ["email", "name"]
          }
        }
      ],
      messages: messages as any
    });

    let finalResponse = '';
    const toolResults: any[] = [];

    for (const content of response.content) {
      if (content.type === 'text') {
        finalResponse = content.text;
      } else if (content.type === 'tool_use') {
        let toolResult = '';

        try {
          if (content.name === 'search_vehicles') {
            const input = content.input as any;
            const vehicles = await searchVehicles(
                input.min_price,
                input.max_price,
                input.fuel_type,
                input.transmission
            );
            toolResult = JSON.stringify(vehicles);
          } else if (content.name === 'get_vehicle_details') {
            const input = content.input as any;
            const vehicle = await getVehicleById(input.vehicle_id);
            toolResult = vehicle ? JSON.stringify(vehicle) : 'Vehicle not found';
          } else if (content.name === 'save_lead') {
            const input = content.input as any;
            await saveLead(
                input.email,
                input.name,
                input.phone || null,
                input.preferences || {},
                sessionId
            );
            toolResult = 'Lead saved successfully';
          }
        } catch (error) {
          toolResult = `Error: ${(error as Error).message}`;
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: content.id,
          content: toolResult
        });
      }
    }

    if (toolResults.length > 0) {
      const finalCall = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        system: `You are CarDealerBot. Format vehicle information clearly with bold names, prices, and features.`,
        messages: [
          ...messages,
          {
            role: 'assistant',
            content: response.content
          } as any,
          {
            role: 'user',
            content: toolResults as any
          }
        ]
      });

      for (const content of finalCall.content) {
        if (content.type === 'text') {
          finalResponse = content.text;
        }
      }
    }

    // Save bot response
    console.log('💾 Saving bot response');
    await addChatMessage(sessionId, 'assistant', finalResponse);

    return NextResponse.json({
      response: finalResponse,
      sessionId: sessionId
    });
  } catch (error) {
    console.error('❌ Chat API error:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error details:', errorMsg);

    return NextResponse.json(
        {
          error: 'Failed to process chat message',
          details: errorMsg,
          sessionId: sessionId || 'unknown'
        },
        { status: 500 }
    );
  }
}