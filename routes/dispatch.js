import express from "express";
import { supabase } from "../supabase/client.js";

const router = express.Router();

// Dispatch data endpoint with filtering support
router.get("/dispatch-data", async (req, res) => {
  try {
    let query = supabase
      .from("dispatch_data")
      .select("*")
      .or('canceled.is.null,canceled.neq.X')
      .order("created_at", { ascending: false });

    const { startDate, endDate, ...filters } = req.query;

    // Use billing_date as the date field
    if (startDate) {
      query = query.gte("billing_date", startDate);
    }
    if (endDate) {
      query = query.lte("billing_date", endDate);
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

// Delete dispatch entry
router.delete("/dispatch-data/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deleted_by } = req.query;
    const { error } = await supabase
      .from("dispatch_data")
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
        `Deleted dispatch entry ID ${id} at ${new Date().toLocaleString()}`;
      
      await supabase
        .from("login_details")
        .update({ work_details: newWorkDetails })
        .eq("full_name", deleted_by);
    }

    res.json({ success: true, message: "Entry deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update dispatch entry
router.put("/dispatch-data/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    delete updates.id;
    delete updates.created_at;

    const { data, error } = await supabase
      .from("dispatch_data")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk add dispatch entries
router.post("/dispatch-data/bulk", async (req, res) => {
  try {
    const entries = req.body;
    if (!Array.isArray(entries)) {
      throw new Error("Payload must be an array");
    }
    const cleaned = entries.map(c => {
      const { id, created_at, ...rest } = c;
      return rest;
    });
    const { data, error } = await supabase
      .from("dispatch_data")
      .insert(cleaned)
      .select();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get dispatch info by invoice number for auto-population
router.get("/dispatch-data/by-invoice/:invoiceNo", async (req, res) => {
  try {
    const { invoiceNo } = req.params;
    const { data, error } = await supabase
      .from("dispatch_data")
      .select("*")
      .eq("billing_document", invoiceNo)
      .or('canceled.is.null,canceled.neq.X')
      .limit(1);

    if (error) throw error;
    
    if (data && data.length > 0) {
      res.json({ success: true, data: data[0] });
    } else {
      res.json({ success: false, message: "Invoice not found" });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Check for duplicates
router.post("/dispatch-data/check-duplicates", async (req, res) => {
  try {
    const entries = req.body;
    if (!Array.isArray(entries)) {
      throw new Error("Payload must be an array");
    }

    // We'll check duplicates in batches to avoid query size limits
    const duplicateIndices = [];
    
    // For each entry, check if it exists in the database
    // This is slow but reliable for the specified columns
    // Optimization: fetch all potentially matching records first if the set is small
    // or use a more complex single query.
    
    // For now, let's do it efficiently by querying for combinations
    // But since there are many columns, we'll just check them one by one or in small batches
    
    // Actually, a better way is to fetch existing records that match the billing documents
    const billingDocs = [...new Set(entries.map(e => e.billing_document))];
    
    const { data: existing, error } = await supabase
      .from("dispatch_data")
      .select("billing_document, billing_date, bill_to_customer, lot_no, plant, product, item_description, billed_quantity, no_of_package, gross_weight, vehicle_number")
      .in("billing_document", billingDocs);
      
    if (error) throw error;
    
    const isDuplicate = (entry, existingRecords) => {
      return existingRecords.some(r => 
        String(r.billing_document) === String(entry.billing_document) &&
        String(r.billing_date) === String(entry.billing_date) &&
        String(r.bill_to_customer) === String(entry.bill_to_customer) &&
        String(r.lot_no) === String(entry.lot_no) &&
        String(r.plant) === String(entry.plant) &&
        String(r.product) === String(entry.product) &&
        String(r.item_description) === String(entry.item_description) &&
        Number(r.billed_quantity) === Number(entry.billed_quantity) &&
        Number(r.no_of_package) === Number(entry.no_of_package) &&
        Number(r.gross_weight) === Number(entry.gross_weight) &&
        String(r.vehicle_number) === String(entry.vehicle_number)
      );
    };

    const duplicates = entries.filter(e => isDuplicate(e, existing));
    const nonDuplicates = entries.filter(e => !isDuplicate(e, existing));

    res.json({ 
      success: true, 
      duplicateCount: duplicates.length,
      nonDuplicates: nonDuplicates
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync dispatch_data with master tables with progress streaming
router.post("/sync-master-data", async (req, res) => {
  try {
    // Set headers for streaming
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    const sendProgress = (data) => {
      res.write(JSON.stringify(data) + "\n");
    };

    // 1. Fetch all master data first to calculate total
    const [countRes, marketRes, customerRes] = await Promise.all([
      supabase.from("count_master").select("item_description, smpl_count, blend").or('smpl_count.neq."",blend.neq.""'),
      supabase.from("market_master").select("ship_to_city, market").not("market", "is", null).neq("market", ""),
      supabase.from("customer_master").select("bill_to_customer, customer_name").not("customer_name", "is", null).neq("customer_name", "")
    ]);

    if (countRes.error) throw countRes.error;
    if (marketRes.error) throw marketRes.error;
    if (customerRes.error) throw customerRes.error;

    const countMaster = countRes.data;
    const marketMaster = marketRes.data;
    const customerMaster = customerRes.data;
    
    const totalTasks = countMaster.length + marketMaster.length + customerMaster.length;
    let completedTasks = 0;

    sendProgress({ type: "start", total: totalTasks });

    // Helper function for parallel batching with progress tracking
    const runInBatches = async (items, updateFn, batchSize = 15) => {
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.all(batch.map(async (item) => {
          await updateFn(item);
          completedTasks++;
          sendProgress({ 
            type: "progress", 
            completed: completedTasks, 
            total: totalTasks,
            percent: Math.round((completedTasks / totalTasks) * 100)
          });
        }));
      }
    };

    // 1. Update smpl_count & blend
    await runInBatches(countMaster, (item) => 
      supabase.from("dispatch_data").update({ smpl_count: item.smpl_count, blend: item.blend }).eq("item_description", item.item_description)
    );

    // 2. Update market
    await runInBatches(marketMaster, (item) => 
      supabase.from("dispatch_data").update({ market: item.market }).eq("ship_to_city", item.ship_to_city)
    );

    // 3. Update customer_name
    await runInBatches(customerMaster, (item) => 
      supabase.from("dispatch_data").update({ customer_name: item.customer_name }).eq("bill_to_customer", item.bill_to_customer)
    );

    sendProgress({ type: "complete", message: "Dispatch master data updated successfully" });
    res.end();
  } catch (err) {
    res.write(JSON.stringify({ type: "error", error: err.message }) + "\n");
    res.end();
  }
});

export default router;
