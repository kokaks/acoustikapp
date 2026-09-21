import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET env var is required.");
}

export type EmployeeRole = "employee" | "admin";

export type AuthTokenPayload = {
  employeeId: string;
  role: EmployeeRole;
  fullName: string;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function issueToken(payload: AuthTokenPayload): string {
  // 12h expiry — long enough for a shift, short enough to limit a lost/shared
  // device. Employees re-login at the start of each shift.
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "12h" });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET as string) as AuthTokenPayload;
}
