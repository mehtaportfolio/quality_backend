import express from "express";
import { supabase } from "../supabase/client.js";

const router = express.Router();

// Refresh Yarn Count Master
router.post("/master/refresh-yarn-count", async (req, res) => {
  try {
    const { data: uniqueItems, error: fetchError } = await supabase
      .from("dispatch_data")
      .select("item_description, division_description")
      .ilike("division_description", "Yarn")
      .or('canceled.is.null,canceled.neq.X');

    if (fetchError) throw fetchError;

    // Use a Map to keep unique item_description and its division
    const uniqueMap = new Map();
    uniqueItems.forEach(item => {
      if (item.item_description) {
        uniqueMap.set(item.item_description, item.division_description);
      }
    });
    
    const upsertData = Array.from(uniqueMap.entries()).map(([desc, div]) => ({ 
      item_description: desc,
      division_description: div
    }));
    
    const { error: upsertError } = await supabase
      .from("count_master")
      .upsert(upsertData, { onConflict: "item_description", ignoreDuplicates: false });

    if (upsertError) throw upsertError;

    res.json({ success: true, message: "Yarn count master refreshed" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Refresh Fabric Count Master
router.post("/master/refresh-fabric-count", async (req, res) => {
  try {
    const { data: uniqueItems, error: fetchError } = await supabase
      .from("dispatch_data")
      .select("item_description, division_description")
      .not("division_description", "ilike", "Yarn")
      .or('canceled.is.null,canceled.neq.X');

    if (fetchError) throw fetchError;

    const uniqueMap = new Map();
    uniqueItems.forEach(item => {
      if (item.item_description) {
        uniqueMap.set(item.item_description, item.division_description);
      }
    });
    
    const upsertData = Array.from(uniqueMap.entries()).map(([desc, div]) => ({ 
      item_description: desc,
      division_description: div
    }));
    
    const { error: upsertError } = await supabase
      .from("count_master")
      .upsert(upsertData, { onConflict: "item_description", ignoreDuplicates: false });

    if (upsertError) throw upsertError;

    res.json({ success: true, message: "Fabric count master refreshed" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Refresh Market Master
router.post("/master/refresh-market", async (req, res) => {
  try {
    const { data: uniqueCities, error: fetchError } = await supabase
      .from("dispatch_data")
      .select("ship_to_city")
      .or('canceled.is.null,canceled.neq.X');

    if (fetchError) throw fetchError;

    const cities = [...new Set(uniqueCities.map(i => i.ship_to_city))].filter(Boolean);
    
    const upsertData = cities.map(city => ({ 
      ship_to_city: city,
      market: "" // Provide empty string for NOT NULL column
    }));
    
    const { error: upsertError } = await supabase
      .from("market_master")
      .upsert(upsertData, { onConflict: "ship_to_city", ignoreDuplicates: true });

    if (upsertError) throw upsertError;

    res.json({ success: true, message: "Market master refreshed" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Refresh Customer Master
router.post("/master/refresh-customer", async (req, res) => {
  try {
    const { data: uniqueCustomers, error: fetchError } = await supabase
      .from("dispatch_data")
      .select("bill_to_customer")
      .or('canceled.is.null,canceled.neq.X');

    if (fetchError) throw fetchError;

    const customers = [...new Set(uniqueCustomers.map(i => i.bill_to_customer))].filter(Boolean);
    
    const upsertData = customers.map(cust => ({ 
      bill_to_customer: cust,
      customer_name: "" // Provide empty string for NOT NULL column
    }));
    
    const { error: upsertError } = await supabase
      .from("customer_master")
      .upsert(upsertData, { onConflict: "bill_to_customer", ignoreDuplicates: true });

    if (upsertError) throw upsertError;

    res.json({ success: true, message: "Customer master refreshed" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Pending Yarn Count Master
router.get("/master/pending-yarn-count", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("count_master")
      .select("*")
      .ilike("division_description", "Yarn")
      .or('smpl_count.is.null,smpl_count.eq."",blend.is.null,blend.eq.""');
    
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Pending Fabric Count Master
router.get("/master/pending-fabric-count", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("count_master")
      .select("*")
      .not("division_description", "ilike", "Yarn")
      .or('smpl_count.is.null,smpl_count.eq."",blend.is.null,blend.eq.""');
    
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Pending Market Master
router.get("/master/pending-market", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("market_master")
      .select("*")
      .or('market.is.null,market.eq.""');
    
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Pending Customer Master
router.get("/master/pending-customer", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("customer_master")
      .select("*")
      .or('customer_name.is.null,customer_name.eq.""');
    
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Count Master
router.put("/master/count/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { smpl_count, blend } = req.body;
    const { data, error } = await supabase
      .from("count_master")
      .update({ smpl_count, blend })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Market Master
router.put("/master/market/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { market } = req.body;
    const { data, error } = await supabase
      .from("market_master")
      .update({ market })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Customer Master
router.put("/master/customer/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_name } = req.body;
    const { data, error } = await supabase
      .from("customer_master")
      .update({ customer_name })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get unique existing values for suggestions
router.get("/master/suggestions/:type", async (req, res) => {
  try {
    const { type } = req.params;
    let table, column;
    
    if (type === "count") {
      table = "count_master";
      column = "smpl_count";
    } else if (type === "blend") {
      table = "count_master";
      column = "blend";
    } else if (type === "market") {
      table = "market_master";
      column = "market";
    } else if (type === "customer") {
      table = "customer_master";
      column = "customer_name";
    } else {
      return res.status(400).json({ success: false, error: "Invalid type" });
    }

    const { data, error } = await supabase
      .from(table)
      .select(column)
      .not(column, "is", null)
      .neq(column, "");

    if (error) throw error;
    
    const uniqueValues = [...new Set(data.map(i => i[column]))].sort();
    res.json({ success: true, data: uniqueValues });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Market Mappings for auto-population
router.get("/master/market-mappings", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("market_master")
      .select("ship_to_city, market");
    
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
