import { supabase } from './supabase/client.js';

async function inspect() {
  const tables = ['yarn_complaints'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('market');
    console.log(`\nTable: ${table} (Unique market)`);
    if (error) {
      console.error(error);
    } else {
      const markets = new Set(data.map(d => String(d.market)));
      console.log(Array.from(markets));
    }
  }
  process.exit(0);
}

inspect();
