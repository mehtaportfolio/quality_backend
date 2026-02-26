import express from "express";
import { supabase } from "../supabase/client.js";

const router = express.Router();

router.get("/yarn-realization", async (req, res) => {
  try {
    // 1. Get the latest date from the table
    const { data: latestEntry, error: dateError } = await supabase
      .from("yarn_realization")
      .select("date")
      .order("date", { ascending: false })
      .limit(1);

    if (dateError) throw dateError;
    if (!latestEntry || latestEntry.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const latestDate = latestEntry[0].date;

    // 2. Try to get monthly data for the latest date
    let { data, error } = await supabase
      .from("yarn_realization")
      .select("*")
      .eq("date", latestDate)
      .eq("period", "monthly");

    if (error) throw error;

    // 3. If no monthly data, try fortnightly
    if (!data || data.length === 0) {
      const { data: fortnightlyData, error: fError } = await supabase
        .from("yarn_realization")
        .select("*")
        .eq("date", latestDate)
        .eq("period", "fortnightly");

      if (fError) throw fError;
      data = fortnightlyData;
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error("Yarn realization fetch error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
