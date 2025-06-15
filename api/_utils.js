import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for Vercel
export function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  });
}

// CORS headers for API responses
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

// Standard API response helper
export function apiResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders
  });
}

// Error response helper
export function errorResponse(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsHeaders
  });
}

// Handle OPTIONS requests for CORS
export function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}

// Parse query parameters
export function parseQueryParams(url) {
  const urlObj = new URL(url);
  const params = {};
  for (const [key, value] of urlObj.searchParams) {
    params[key] = value;
  }
  return params;
}