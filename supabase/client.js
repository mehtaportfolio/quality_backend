import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL environment variable is missing.");
}
if (!supabaseKey) {
  throw new Error("SUPABASE_ANON_KEY environment variable is missing.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
