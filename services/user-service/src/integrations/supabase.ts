import { createClient } from "@supabase/supabase-js";

import { getUserServiceEnv } from "../config/env.js";

const env = getUserServiceEnv();

export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
