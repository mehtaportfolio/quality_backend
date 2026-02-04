import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { supabase } from "./supabase/client.js";
import complaintRoutes from "./routes/complaints.js";
import layoutRoutes from "./routes/layouts.js";
import utilRoutes from "./routes/utils.js";
import dispatchRoutes from "./routes/dispatch.js";
import masterRoutes from "./routes/master.js";
import dispatchResultsRoutes from "./routes/dispatch-results.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check route
app.get("/health", (req, res) => {
  res.json({ status: "Backend is running" });
});

// Supabase connectivity test
app.get("/supabase-test", async (req, res) => {
  const { data, error } = await supabase
    .from("information_schema.tables")
    .select("table_name")
    .limit(5);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, data });
});

// Use modular routes
const apiRouter = express.Router();
apiRouter.use(complaintRoutes);
apiRouter.use(layoutRoutes);
apiRouter.use(utilRoutes);
apiRouter.use(dispatchRoutes);
apiRouter.use(masterRoutes);
apiRouter.use(dispatchResultsRoutes);

app.use("/api", apiRouter);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
