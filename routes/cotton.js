import express from "express";
import { supabase } from "../supabase/client.js";

const router = express.Router();

// Get all cotton groups/varieties
router.get("/cotton/groups", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("cotton_groups")
      .select("*")
      .order("cotton_group", { ascending: true });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get planning history
router.get("/cotton/planning", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("cotton_planning")
      .select(`
        *,
        cotton_planning_blend (*)
      `)
      .order("unit", { ascending: true });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save a new planning
router.post("/cotton/planning", async (req, res) => {
  const { unit, laydown_consumption, no_of_bales_per_laydown, blend } = req.body;
  
  if (!unit || laydown_consumption === undefined || no_of_bales_per_laydown === undefined) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  try {
    // 1. Insert into cotton_planning
    const { data: planningData, error: planningError } = await supabase
      .from("cotton_planning")
      .insert([{ unit, laydown_consumption, no_of_bales_per_laydown }])
      .select()
      .single();

    if (planningError) throw planningError;

    // 2. Insert into cotton_planning_blend if provided
    if (blend && Array.isArray(blend) && blend.length > 0) {
      const blendData = blend.map(item => ({
        planning_id: planningData.id,
        unit: planningData.unit,
        cotton_variety: item.cotton_variety,
        percentage: item.percentage,
        calculated_bales: item.calculated_bales
      }));

      const { error: blendError } = await supabase
        .from("cotton_planning_blend")
        .insert(blendData);

      if (blendError) throw blendError;
    }

    res.json({ success: true, data: planningData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a planning
router.delete("/cotton/planning/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deleted_by } = req.query;
    
    // First delete blends due to foreign key
    const { error: blendError } = await supabase
      .from("cotton_planning_blend")
      .delete()
      .eq("planning_id", id);

    if (blendError) throw blendError;

    const { error: planningError } = await supabase
      .from("cotton_planning")
      .delete()
      .eq("id", id);

    if (planningError) throw planningError;

    if (deleted_by) {
      const { data: userData } = await supabase
        .from("login_details")
        .select("work_details")
        .eq("full_name", deleted_by)
        .single();
      
      const newWorkDetails = (userData?.work_details ? userData.work_details + "\n" : "") + 
        `Deleted cotton planning ID ${id} at ${new Date().toLocaleString()}`;
      
      await supabase
        .from("login_details")
        .update({ work_details: newWorkDetails })
        .eq("full_name", deleted_by);
    }

    res.json({ success: true, message: "Planning deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update a planning
router.put("/cotton/planning/:id", async (req, res) => {
  const { id } = req.params;
  const { unit, laydown_consumption, no_of_bales_per_laydown, blend } = req.body;
  
  if (!unit || laydown_consumption === undefined || no_of_bales_per_laydown === undefined) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  try {
    // 1. Update main table
    const { error: planningError } = await supabase
      .from("cotton_planning")
      .update({ unit, laydown_consumption, no_of_bales_per_laydown })
      .eq("id", id);

    if (planningError) throw planningError;

    // 1.5. Always update unit name in blend table to keep in sync
    const { error: syncError } = await supabase
      .from("cotton_planning_blend")
      .update({ unit: unit })
      .eq("planning_id", id);

    if (syncError) throw syncError;

    // 2. Only update blends if provided
    if (blend && Array.isArray(blend)) {
      // Delete old blends
      const { error: deleteError } = await supabase
        .from("cotton_planning_blend")
        .delete()
        .eq("planning_id", id);

      if (deleteError) throw deleteError;

      // Insert new blends
      if (blend.length > 0) {
        const blendData = blend.map(item => ({
          planning_id: id,
          unit: unit,
          cotton_variety: item.cotton_variety,
          percentage: item.percentage,
          calculated_bales: item.calculated_bales
        }));

        const { error: blendError } = await supabase
          .from("cotton_planning_blend")
          .insert(blendData);

        if (blendError) throw blendError;
      }
    }

    res.json({ success: true, message: "Planning updated" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add a new cotton group/variety
router.post("/cotton/groups", async (req, res) => {
  const { cotton_group, cotton_variety, avg_bale_weight } = req.body;
  
  if (!cotton_group || !cotton_variety || avg_bale_weight === undefined) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  try {
    const { data, error } = await supabase
      .from("cotton_groups")
      .insert([{ cotton_group, cotton_variety, avg_bale_weight }])
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update a cotton group/variety
router.put("/cotton/groups/:id", async (req, res) => {
  const { id } = req.params;
  const { cotton_group, cotton_variety, avg_bale_weight } = req.body;

  if (!cotton_group || !cotton_variety || avg_bale_weight === undefined) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  try {
    const { data, error } = await supabase
      .from("cotton_groups")
      .update({ cotton_group, cotton_variety, avg_bale_weight })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a cotton group/variety
router.delete("/cotton/groups/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deleted_by } = req.query;
    const { error } = await supabase
      .from("cotton_groups")
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
        `Deleted cotton variety ID ${id} at ${new Date().toLocaleString()}`;
      
      await supabase
        .from("login_details")
        .update({ work_details: newWorkDetails })
        .eq("full_name", deleted_by);
    }

    res.json({ success: true, message: "Variety deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
