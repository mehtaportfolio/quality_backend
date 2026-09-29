import express from "express";
import { supabase } from "../supabase/client.js";

const router = express.Router();

// Get saved table layout list
router.get("/table-layouts/:tableName", async (req, res) => {
  try {
    const { tableName } = req.params;
    const { data, error } = await supabase
      .from("table_layouts")
      .select("id, layout_name, layout, updated_at")
      .eq("table_name", tableName)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save / update table layout
router.post("/table-layout", async (req, res) => {
  try {
    const { id, table_name, layout_name, layout } = req.body;
    if (!table_name || !layout_name || !layout) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const upsertData = {
      table_name,
      layout_name,
      layout,
      user_id: null,
      updated_at: new Date()
    };

    if (id) upsertData.id = id;

    const { data, error } = await supabase
      .from("table_layouts")
      .upsert(upsertData, {
        onConflict: id ? "id" : "user_id,table_name,layout_name"
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single table layout
router.get("/table-layout/:tableName", async (req, res) => {
  try {
    const { tableName } = req.params;
    const { data, error } = await supabase
      .from("table_layouts")
      .select("*")
      .eq("table_name", tableName)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    res.json({ success: true, data: data ?? null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete table layout
router.delete("/table-layout/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deleted_by } = req.query;
    const { error } = await supabase
      .from("table_layouts")
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
        `Deleted table layout ID ${id} at ${new Date().toLocaleString()}`;
      
      await supabase
        .from("login_details")
        .update({ work_details: newWorkDetails })
        .eq("full_name", deleted_by);
    }

    res.json({ success: true, message: "Layout deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
