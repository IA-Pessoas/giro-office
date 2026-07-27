import { createClient } from "@supabase/supabase-js";

import { getClientServiceEnv } from "../config/env.js";

const env = getClientServiceEnv();

export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
