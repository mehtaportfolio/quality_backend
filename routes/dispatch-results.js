import express from "express";
import { supabase } from "../supabase/client.js";

const router = express.Router();

// Get all dispatch results
router.get("/dispatch-results", async (req, res) => {
  try {
    const { lot_no } = req.query;
    let query = supabase
      .from("dispatch_results")
      .select("*")
      .order("created_at", { ascending: false });

    if (lot_no) {
      query = query.eq("lot_no", lot_no);
    }

    const { data: results, error: resultsError } = await query;
    if (resultsError) throw resultsError;

    // Get unique lot numbers to fetch corresponding dispatch info
    const lotNos = [...new Set(results.map(r => r.lot_no).filter(Boolean))];
    
    if (lotNos.length > 0) {
      // Fetch smpl_count, customer_name, item_description, blend, and billing_date from dispatch_data
      const { data: dispatchData, error: dispatchError } = await supabase
        .from("dispatch_data")
        .select("lot_no, smpl_count, customer_name, item_description, blend, billing_date")
        .in("lot_no", lotNos);
      
      if (!dispatchError && dispatchData) {
        const dispatchMap = dispatchData.reduce((acc, curr) => {
          // Store the latest dispatch info for each lot
          // Sort by billing_date if there are multiple entries for the same lot
          if (!acc[curr.lot_no] || new Date(curr.billing_date) > new Date(acc[curr.lot_no].billing_date)) {
            acc[curr.lot_no] = curr;
          }
          return acc;
        }, {});

        const merged = results.map(r => ({
          ...r,
          smpl_count: r.smpl_count || dispatchMap[r.lot_no]?.smpl_count || "-",
          blend: r.blend || dispatchMap[r.lot_no]?.blend || "-",
          customer_short_name: r.customer_short_name || dispatchMap[r.lot_no]?.customer_name || "-",
          item_description: dispatchMap[r.lot_no]?.item_description || "-",
          billing_date: dispatchMap[r.lot_no]?.billing_date || null
        }));
        
        return res.json({ success: true, data: merged });
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add new dispatch result
router.post("/dispatch-results", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("dispatch_results")
      .insert([req.body])
      .select();

    if (error) throw error;
    res.json({ success: true, data: data[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Batch add dispatch results
router.post("/dispatch-results/batch", async (req, res) => {
  try {
    const { results } = req.body;
    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ success: false, error: "No results provided" });
    }

    // Get unique lot numbers in this batch to narrow down existing records check
    const lotNos = [...new Set(results.map(r => r.lot_no).filter(Boolean))];
    
    let existingRecords = [];
    if (lotNos.length > 0) {
      const { data, error: fetchError } = await supabase
        .from("dispatch_results")
        .select("billing_date, lot_no, customer_name, billing_document")
        .in("lot_no", lotNos);
      
      if (!fetchError && data) {
        existingRecords = data;
      }
    }

    // Filter out duplicates
    const toInsert = [];
    let skippedCount = 0;

    for (const row of results) {
      const isDuplicate = existingRecords.some(existing => 
        String(existing.billing_date || "") === String(row.billing_date || "") &&
        String(existing.lot_no || "") === String(row.lot_no || "") &&
        String(existing.customer_name || "") === String(row.customer_name || "") &&
        String(existing.billing_document || "") === String(row.billing_document || "")
      );

      if (isDuplicate) {
        skippedCount++;
      } else {
        toInsert.push(row);
      }
    }

    if (toInsert.length === 0) {
      return res.json({ success: true, data: [], inserted: 0, skipped: skippedCount });
    }

    const { data, error } = await supabase
      .from("dispatch_results")
      .insert(toInsert)
      .select();

    if (error) throw error;
    res.json({ success: true, data, inserted: toInsert.length, skipped: skippedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Count and Customer information from master tables - Plan
router.get("/dispatch-results/update-masters-plan", async (req, res) => {
  try {
    const { data: countMaster } = await supabase
      .from("count_master")
      .select("item_description, smpl_count, blend");

    const { data: customerMaster } = await supabase
      .from("customer_master")
      .select("bill_to_customer, customer_name")
      .not("customer_name", "is", null)
      .neq("customer_name", "");

    const { data: toUpdate, error: fetchError } = await supabase
      .from("dispatch_results")
      .select("id, item_description, name_of_customer, smpl_count, customer_short_name, blend")
      .or('smpl_count.eq.-,smpl_count.is.null,customer_short_name.eq.-,customer_short_name.is.null,blend.eq.-,blend.is.null');

    if (fetchError) throw fetchError;

    const updates = [];
    const countMap = new Map(countMaster?.map(cm => [cm.item_description, { smpl_count: cm.smpl_count, blend: cm.blend }]) || []);
    const custMap = new Map(customerMaster?.map(cm => [cm.bill_to_customer, cm.customer_name]) || []);

    for (const row of toUpdate) {
      const masterInfo = countMap.get(row.item_description);
      const newCust = custMap.get(row.name_of_customer);
      
      const updateObj = {};
      let changed = false;

      if (masterInfo) {
        if (masterInfo.smpl_count && (!row.smpl_count || row.smpl_count === "-")) {
          updateObj.smpl_count = masterInfo.smpl_count;
          changed = true;
        }
        if (masterInfo.blend && (!row.blend || row.blend === "-")) {
          updateObj.blend = masterInfo.blend;
          changed = true;
        }
      }

      if (newCust && (!row.customer_short_name || row.customer_short_name === "-")) {
        updateObj.customer_short_name = newCust;
        changed = true;
      }

      if (changed) {
        updates.push({ id: row.id, ...updateObj });
      }
    }

    res.json({ success: true, updates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Count and Customer information from master tables - Execute
router.post("/dispatch-results/update-masters-execute", async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) throw new Error("Invalid updates format");

    // Perform updates in parallel for the chunk
    await Promise.all(updates.map(u => {
      const { id, ...data } = u;
      return supabase
        .from("dispatch_results")
        .update(data)
        .eq("id", id);
    }));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Deprecated old endpoint
router.post("/dispatch-results/update-masters", async (req, res) => {
  res.status(410).json({ success: false, error: "This endpoint is deprecated. Use update-masters-plan and update-masters-execute." });
});

export default router;
