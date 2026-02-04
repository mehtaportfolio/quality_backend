import express from "express";
import { supabase } from "../supabase/client.js";

const router = express.Router();

// Get table columns
router.get("/table-columns/:tableName", async (req, res) => {
  try {
    const { tableName } = req.params;
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .limit(1);

    if (error) throw error;

    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    res.json({ success: true, data: columns });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get unique values for a column to populate filter dropdown
router.get("/unique-values/:tableName/:columnName", async (req, res) => {
  try {
    const { tableName, columnName } = req.params;
    const filters = req.query;

    let query = supabase
      .from(tableName)
      .select(columnName)
      .not(columnName, "is", null);

    if (tableName === "dispatch_data") {
      query = query.or('canceled.is.null,canceled.neq.X');
    }

    // Apply additional filters from query parameters
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        query = query.eq(key, value);
      }
    });

    const { data, error } = await query;

    if (error) throw error;
    const uniqueValues = [...new Set(data.map(item => item[columnName]))]
      .filter(val => val !== "" && val !== null)
      .sort();

    res.json({ success: true, data: uniqueValues });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get available years for any table and date column
router.get("/available-years/:tableName/:dateColumn", async (req, res) => {
  try {
    const { tableName, dateColumn } = req.params;
    const { data, error } = await supabase
      .from(tableName)
      .select(dateColumn)
      .not(dateColumn, "is", null);

    if (error) throw error;

    const years = new Set();
    data.forEach(item => {
      if (item[dateColumn]) {
        const d = new Date(item[dateColumn]);
        if (!isNaN(d.getTime())) years.add(d.getFullYear().toString());
      }
    });

    res.json({
      success: true,
      data: Array.from(years).sort((a, b) => b.localeCompare(a))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get maximum date for a column
router.get("/max-date/:tableName/:dateColumn", async (req, res) => {
  try {
    const { tableName, dateColumn } = req.params;
    const { data, error } = await supabase
      .from(tableName)
      .select(dateColumn)
      .not(dateColumn, "is", null)
      .order(dateColumn, { ascending: false })
      .limit(1);

    if (error) throw error;

    res.json({
      success: true,
      data: data.length > 0 ? data[0][dateColumn] : null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET available years for complaints
router.get("/available-years", async (req, res) => {
  try {
    const [yarnRes, fabricRes] = await Promise.all([
      supabase.from("yarn_complaints").select("query_received_date"),
      supabase.from("fabric_complaints").select("query_received_date")
    ]);

    if (yarnRes.error) throw yarnRes.error;
    if (fabricRes.error) throw fabricRes.error;

    const years = new Set();
    years.add(new Date().getFullYear().toString());

    yarnRes.data.forEach(item => {
      if (item.query_received_date) {
        years.add(new Date(item.query_received_date).getFullYear().toString());
      }
    });

    fabricRes.data.forEach(item => {
      if (item.query_received_date) {
        years.add(new Date(item.query_received_date).getFullYear().toString());
      }
    });

    res.json({
      success: true,
      data: Array.from(years).sort((a, b) => b.localeCompare(a))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET complaint statistics (Open, Closed, Incomplete)
router.get("/complaint-stats", async (req, res) => {
  try {
    const { year, ...filters } = req.query;
    
    const getStats = async (tableName) => {
      let query = supabase.from(tableName).select("*");
      
      if (year) {
        query = query.gte("query_received_date", `${year}-01-01`).lte("query_received_date", `${year}-12-31`);
      }

      // Apply additional filters (e.g., market, nature_of_complaint, status)
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== "undefined") {
          query = query.eq(key, value);
        }
      });

      const { data, error } = await query;
      if (error) throw error;

      let open = 0;
      let closed = 0;
      let incomplete = 0;
      let totalComplaints = data.length;
      let customers = new Set();
      
      data.forEach(row => {
        // Status checks
        const status = (row.status || "").toLowerCase();
        if (status === "open") open++;
        else if (status === "closed" || status === "close") closed++;
        
        // Customer count
        if (row.customer_name) {
          customers.add(row.customer_name);
        }

        // Incomplete checks
        const isIncomplete = Object.entries(row).some(([key, value]) => {
          if (["id", "created_at", "action_taken", "remark", "complaint_qty", "analysis_and_outcome", "reply_date", "mfg_date", "mfg_month", "cotton", "complaint_mode", "nature_of_complaint"].includes(key)) return false;
          return value === null || value === "" || value === undefined;
        });
        if (isIncomplete) incomplete++;
      });

      return { open, closed, incomplete, totalComplaints, totalCustomers: customers.size };
    };

    const [yarn, fabric] = await Promise.all([
      getStats("yarn_complaints"),
      getStats("fabric_complaints")
    ]);

    res.json({ success: true, data: { yarn, fabric } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
