import express from "express";
import { supabase } from "../supabase/client.js";

const router = express.Router();

const DATE_COLUMNS = ["query_received_date", "invoice_date", "reply_date", "mfg_date"];

function nullifyDates(obj) {
  const newObj = { ...obj };
  DATE_COLUMNS.forEach(col => {
    if (newObj[col] === "") {
      newObj[col] = null;
    }
  });
  return newObj;
}

async function updateMarketMaster(ship_to_city, market) {
  if (!ship_to_city) return;
  try {
    await supabase
      .from("market_master")
      .upsert({ ship_to_city, market: market || "" }, { onConflict: "ship_to_city" });
  } catch (err) {
    console.error("Failed to update market_master", err);
  }
}

// Yarn complaints endpoint with filtering support
router.get("/yarn-complaints", async (req, res) => {
  try {
    let query = supabase
      .from("yarn_complaints")
      .select("*")
      .order("query_received_date", { ascending: false });

    const { startDate, endDate, ...filters } = req.query;

    if (startDate) {
      query = query.gte("query_received_date", startDate);
    }
    if (endDate) {
      query = query.lte("query_received_date", endDate);
    }

    Object.entries(filters).forEach(([column, value]) => {
      if (value) {
        const filterValues = String(value).split(",");
        if (filterValues.length > 1) {
          query = query.in(column, filterValues);
        } else {
          query = query.eq(column, value);
        }
      }
    });

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fabric complaints endpoint with filtering support
router.get("/fabric-complaints", async (req, res) => {
  try {
    let query = supabase
      .from("fabric_complaints")
      .select("*")
      .order("query_received_date", { ascending: false });

    const { startDate, endDate, ...filters } = req.query;

    if (startDate) {
      query = query.gte("query_received_date", startDate);
    }
    if (endDate) {
      query = query.lte("query_received_date", endDate);
    }

    Object.entries(filters).forEach(([column, value]) => {
      if (value) {
        const filterValues = String(value).split(",");
        if (filterValues.length > 1) {
          query = query.in(column, filterValues);
        } else {
          query = query.eq(column, value);
        }
      }
    });

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete yarn complaint
router.delete("/yarn-complaints/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deleted_by } = req.query;
    const { error } = await supabase
      .from("yarn_complaints")
      .delete()
      .eq("id", id);
    if (error) throw error;

    if (deleted_by) {
      const { data: userData } = await supabase
        .from("login_details")
        .select("work_details")
        .eq("full_name", deleted_by)
        .single();
      
      const newWorkDetails = (userData?.work_details ? userData.work_details + "\n" : "") + 
        `Deleted yarn complaint ID ${id} at ${new Date().toLocaleString()}`;
      
      await supabase
        .from("login_details")
        .update({ work_details: newWorkDetails })
        .eq("full_name", deleted_by);
    }

    res.json({ success: true, message: "Complaint deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete fabric complaint
router.delete("/fabric-complaints/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deleted_by } = req.query;
    const { error } = await supabase
      .from("fabric_complaints")
      .delete()
      .eq("id", id);
    if (error) throw error;

    if (deleted_by) {
      const { data: userData } = await supabase
        .from("login_details")
        .select("work_details")
        .eq("full_name", deleted_by)
        .single();
      
      const newWorkDetails = (userData?.work_details ? userData.work_details + "\n" : "") + 
        `Deleted fabric complaint ID ${id} at ${new Date().toLocaleString()}`;
      
      await supabase
        .from("login_details")
        .update({ work_details: newWorkDetails })
        .eq("full_name", deleted_by);
    }

    res.json({ success: true, message: "Complaint deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update yarn complaint
router.put("/yarn-complaints/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let updates = req.body;
    delete updates.id;
    delete updates.created_at;
    updates = nullifyDates(updates);

    const { data, error } = await supabase
      .from("yarn_complaints")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    
    // Update market_master if bill_to_region (city) and market are provided
    if (updates.bill_to_region) {
      await updateMarketMaster(updates.bill_to_region, updates.market);
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update fabric complaint
router.put("/fabric-complaints/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let updates = req.body;
    delete updates.id;
    delete updates.created_at;
    updates = nullifyDates(updates);

    const { data, error } = await supabase
      .from("fabric_complaints")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Update market_master if bill_to_region (city) and market are provided
    if (updates.bill_to_region) {
      await updateMarketMaster(updates.bill_to_region, updates.market);
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create yarn complaint
router.post("/yarn-complaints", async (req, res) => {
  try {
    let complaint = req.body;
    delete complaint.id;
    delete complaint.created_at;
    complaint = nullifyDates(complaint);

    const { data, error } = await supabase
      .from("yarn_complaints")
      .insert([complaint])
      .select()
      .single();

    if (error) throw error;

    // Update market_master if bill_to_region (city) and market are provided
    if (complaint.bill_to_region) {
      await updateMarketMaster(complaint.bill_to_region, complaint.market);
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create fabric complaint
router.post("/fabric-complaints", async (req, res) => {
  try {
    let complaint = req.body;
    delete complaint.id;
    delete complaint.created_at;
    complaint = nullifyDates(complaint);

    const { data, error } = await supabase
      .from("fabric_complaints")
      .insert([complaint])
      .select()
      .single();

    if (error) throw error;

    // Update market_master if bill_to_region (city) and market are provided
    if (complaint.bill_to_region) {
      await updateMarketMaster(complaint.bill_to_region, complaint.market);
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk add yarn complaints
router.post("/yarn-complaints/bulk", async (req, res) => {
  try {
    const complaints = req.body;
    if (!Array.isArray(complaints)) {
      throw new Error("Payload must be an array of complaints");
    }
    const cleaned = complaints.map(c => {
      const { id, created_at, ...rest } = c;
      return nullifyDates(rest);
    });
    const { data, error } = await supabase
      .from("yarn_complaints")
      .insert(cleaned)
      .select();
    if (error) throw error;

    // Bulk update market_master
    for (const c of cleaned) {
      if (c.bill_to_region) {
        await updateMarketMaster(c.bill_to_region, c.market);
      }
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk add fabric complaints
router.post("/fabric-complaints/bulk", async (req, res) => {
  try {
    const complaints = req.body;
    if (!Array.isArray(complaints)) {
      throw new Error("Payload must be an array of complaints");
    }
    const cleaned = complaints.map(c => {
      const { id, created_at, ...rest } = c;
      return nullifyDates(rest);
    });
    const { data, error } = await supabase
      .from("fabric_complaints")
      .insert(cleaned)
      .select();
    if (error) throw error;

    // Bulk update market_master
    for (const c of cleaned) {
      if (c.bill_to_region) {
        await updateMarketMaster(c.bill_to_region, c.market);
      }
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get aggregated billed quantity from dispatch_data for complaints charts
router.get("/dispatch-stats", async (req, res) => {
  try {
    const { division, startDate, endDate, ...filters } = req.query;
    
    let query = supabase
      .from("dispatch_data")
      .select("plant, market, billing_date, billed_quantity, customer_name");

    // Filter by division (YARN or GREY FABRIC)
    if (division === "Yarn") {
      query = query.ilike("division_description", "%YARN%");
    } else if (division === "Fabric") {
      query = query.ilike("division_description", "%FABRIC%");
    }

    // Date filters matching complaints selected time frame
    if (startDate) query = query.gte("billing_date", startDate);
    if (endDate) query = query.lte("billing_date", endDate);

    // Apply other filters (market, etc.)
    Object.entries(filters).forEach(([col, val]) => {
      if (val) {
        const values = String(val).split(",");
        if (values.length > 1) {
          query = query.in(col, values);
        } else {
          query = query.eq(col, val);
        }
      }
    });

    const { data, error } = await query;
    if (error) throw error;

    const stats = {
      unit: {},
      market: {},
      customer: {},
      month: {},
      year: {},
      total: 0
    };

    const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    data.forEach(item => {
      // Parse billed_quantity: "8,870 KG" -> 8.87 MT
      const qtyStr = String(item.billed_quantity || "0");
      const qtyKg = parseFloat(qtyStr.replace(/,/g, "").split(" ")[0]) || 0;
      const qtyMT = qtyKg / 1000;

      // Plant mapping: 1101 -> 1 for Yarn, 1201 -> 1201 for Fabric
      const p = parseInt(item.plant);
      const mappedPlant = (division === "Yarn") ? (p % 100) : p;
      const unit = String(mappedPlant);

      const market = String(item.market || "Unknown");
      const customer = String(item.customer_name || "Unknown");
      
      const date = new Date(item.billing_date);
      if (!isNaN(date.getTime())) {
        const month = MONTH_NAMES[date.getMonth()];
        const year = String(date.getFullYear());

        stats.month[month] = (stats.month[month] || 0) + qtyMT;
        stats.year[year] = (stats.year[year] || 0) + qtyMT;
      }

      stats.unit[unit] = (stats.unit[unit] || 0) + qtyMT;
      stats.market[market] = (stats.market[market] || 0) + qtyMT;
      stats.customer[customer] = (stats.customer[customer] || 0) + qtyMT;
      stats.total += qtyMT;
    });

    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
