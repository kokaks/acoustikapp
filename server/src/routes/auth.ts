import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { verifyPassword, issueToken } from "../auth";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "username and password are required." });
  }
  const { username, password } = parsed.data;

  const { rows } = await pool.query(
    `select id, full_name, password_hash, role, active from employees where username = $1`,
    [username]
  );
  const employee = rows[0];
  if (!employee || !employee.active) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const valid = await verifyPassword(password, employee.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const token = issueToken({
    employeeId: employee.id,
    role: employee.role,
    fullName: employee.full_name,
  });

  res.json({
    token,
    employee: { id: employee.id, fullName: employee.full_name, role: employee.role },
  });
});
