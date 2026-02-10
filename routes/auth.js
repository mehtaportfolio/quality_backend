import express from "express";
import { supabase } from "../supabase/client.js";

const router = express.Router();

router.get("/login-names", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("login_details")
      .select("full_name")
      .order("full_name", { ascending: true });

    if (error) throw error;

    // Get unique names
    const names = [...new Set(data.map(item => item.full_name))].filter(Boolean);
    res.json({ success: true, names });
  } catch (err) {
    console.error("Error fetching names:", err);
    res.status(500).json({ success: false, message: "Failed to fetch user names" });
  }
});

// GET all users
router.get("/users", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("login_details")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ success: true, users: data });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
});

// POST create user
router.post("/users", async (req, res) => {
  const { role, full_name, secret_password, work_details } = req.body;
  try {
    const { data, error } = await supabase
      .from("login_details")
      .insert([{ role, full_name, secret_password, work_details }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, user: data });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ success: false, message: "Failed to create user" });
  }
});

// PUT update user
router.put("/users/:id", async (req, res) => {
  const { id } = req.params;
  const { role, full_name, secret_password, work_details } = req.body;
  try {
    const { data, error } = await supabase
      .from("login_details")
      .update({ role, full_name, secret_password, work_details, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, user: data });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ success: false, message: "Failed to update user" });
  }
});

// DELETE user
router.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  const { deleted_by } = req.query;
  try {
    const { error } = await supabase
      .from("login_details")
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
        `Deleted user ID ${id} at ${new Date().toLocaleString()}`;
      
      await supabase
        .from("login_details")
        .update({ work_details: newWorkDetails })
        .eq("full_name", deleted_by);
    }

    res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ success: false, message: "Failed to delete user" });
  }
});

router.post("/login", async (req, res) => {
  const { role, full_name, secret_password } = req.body;
  console.log("Login attempt:", { role, full_name });

  try {
    const { data, error } = await supabase
      .from("login_details")
      .select("*")
      .eq("role", role)
      .eq("full_name", full_name)
      .eq("secret_password", secret_password)
      .single();

    if (error) {
      console.error("Supabase error during login:", error.message);
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials. Please check your role, full name, and secret password." 
      });
    }

    if (!data) {
      console.log("No user found with matching credentials");
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials. Please check your role, full name, and secret password." 
      });
    }

    console.log("Login successful for user:", data.id);
    const userToReinsert = { 
      role: data.role, 
      full_name: data.full_name, 
      secret_password: data.secret_password,
      last_login: new Date().toISOString(),
      work_details: data.work_details 
    };

    // Delete existing user info and write new info as requested
    await supabase
      .from("login_details")
      .delete()
      .eq("id", data.id);

    const { data: newData, error: insertError } = await supabase
      .from("login_details")
      .insert([userToReinsert])
      .select()
      .single();

    if (insertError) throw insertError;

    res.json({
      success: true,
      user: {
        id: newData.id,
        full_name: newData.full_name,
        role: newData.role
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error during login" });
  }
});

export default router;
