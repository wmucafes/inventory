"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";

type UserRole = "admin" | "commissary" | "cafe" | "driver";
type CafeOption = { id: number; code: string; name: string };
type User = { id: number; email: string; role: UserRole; cafe_id: number | null; cafe_name: string | null; created_at: string };

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  commissary: "Commissary",
  cafe: "Cafe",
  driver: "Driver",
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-purple-100 text-purple-800 border-purple-200",
  commissary: "bg-amber-100 text-amber-800 border-amber-200",
  cafe: "bg-blue-100 text-blue-800 border-blue-200",
  driver: "bg-green-100 text-green-800 border-green-200",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function roleLabel(user: User): string {
  if (user.role === "cafe") {
    return user.cafe_name ? `Cafe – ${user.cafe_name}` : "Cafe – All";
  }
  return ROLE_LABELS[user.role];
}

export default function AdminPage() {
  const router = useRouter();
  const [sessionEmail, setSessionEmail] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [cafeOptions, setCafeOptions] = useState<CafeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add form
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("cafe");
  const [newCafeId, setNewCafeId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  // Revoke
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Reset password
  const [resetEmail, setResetEmail] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    async function init() {
      const sessionRes = await fetch("/api/auth/session");
      if (!sessionRes.ok) { router.push("/"); return; }
      const sessionData = (await sessionRes.json()) as { email?: string; role?: string };
      if (sessionData.role !== "admin") { router.push("/"); return; }
      setSessionEmail(sessionData.email ?? "");

      const [usersRes, cafesRes] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/cafes", { cache: "no-store" }),
      ]);

      if (!usersRes.ok) { setError("Unable to load users."); setLoading(false); return; }
      const data = (await usersRes.json()) as { users: User[] };
      setUsers(data.users);

      if (cafesRes.ok) {
        const cafesData = (await cafesRes.json()) as { cafes?: CafeOption[] };
        setCafeOptions(cafesData.cafes ?? []);
      }

      setLoading(false);
    }
    init();
  }, [router]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!newEmail.trim()) { setAddError("Enter an email address."); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), role: newRole, cafe_id: newRole === "cafe" ? newCafeId : null, password: newPassword }),
      });
      const data = (await res.json()) as { user?: User; error?: string };
      if (!res.ok) { setAddError(data.error ?? "Unable to add user."); return; }
      setUsers((prev) => {
        const existing = prev.findIndex((u) => u.email === data.user!.email);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = data.user!;
          return updated;
        }
        return [...prev, data.user!];
      });
      setNewEmail("");
      setNewRole("cafe");
      setNewCafeId(null);
      setNewPassword("");
    } catch {
      setAddError("Unable to add user right now.");
    } finally {
      setAdding(false);
    }
  };

  const handleRevoke = async (email: string) => {
    setRevoking(email);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setError(data.error ?? "Unable to revoke access."); return; }
      setUsers((prev) => prev.filter((u) => u.email !== email));
      setConfirmRevoke(null);
    } catch {
      setError("Unable to revoke access right now.");
    } finally {
      setRevoking(null);
    }
  };

  const handleResetPassword = async () => {
    if (!resetEmail || !resetPassword) return;
    setResetError("");
    setResetting(true);
    try {
      const res = await fetch("/api/admin/users/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail, password: resetPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setResetError(data.error ?? "Unable to reset password."); return; }
      setResetEmail(null);
      setResetPassword("");
    } catch {
      setResetError("Unable to reset password right now.");
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f1e8]">
        <p className="text-sm text-stone-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f1e8] text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <Image src="/wmu-logo.png" alt="WMU logo" width={160} height={46} className="h-auto w-[160px]" priority />
            <div>
              <p className="text-xs font-semibold uppercase text-stone-500">System</p>
              <h1 className="text-lg font-semibold text-[#2f200f]">Access Management</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* <a href="/admin/tags" className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-stone-400 transition">Tag Management</a> */}
<a href="/" className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-stone-400 transition">Dashboard</a>
            <p className="text-sm text-stone-500">{sessionEmail}</p>
            <SignOutButton />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        {!!error && <p className="text-sm font-medium text-red-700">{error}</p>}

        {/* Add user form */}
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden shadow-sm">
          <div className="border-b border-stone-100 bg-[#f3ead8] px-5 py-3">
            <h2 className="font-semibold text-[#2f200f] text-sm">Grant Access</h2>
            <p className="text-xs text-[#7a6040] mt-0.5">Add a WMU email and assign their role. If the email already exists, their role will be updated.</p>
          </div>
          <form onSubmit={handleAdd} className="px-5 py-4 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-semibold text-stone-500 mb-1.5">WMU Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="broncos@wmich.edu"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-[#c49a3c] focus:ring-2 focus:ring-[#c49a3c44]"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs font-semibold text-stone-500 mb-1.5">Role</label>
              <select
                value={newRole}
                onChange={(e) => { setNewRole(e.target.value as UserRole); setNewCafeId(null); }}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-[#c49a3c] focus:ring-2 focus:ring-[#c49a3c44]"
              >
                <option value="admin">Admin</option>
                <option value="commissary">Commissary</option>
                <option value="cafe">Cafe</option>
                <option value="driver">Driver</option>
              </select>
            </div>
            {newRole === "cafe" && (
              <div className="w-44">
                <label className="block text-xs font-semibold text-stone-500 mb-1.5">Cafe Access</label>
                <select
                  value={newCafeId ?? ""}
                  onChange={(e) => setNewCafeId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-[#c49a3c] focus:ring-2 focus:ring-[#c49a3c44]"
                >
                  <option value="">All Cafes</option>
                  {cafeOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="w-40">
              <label className="block text-xs font-semibold text-stone-500 mb-1.5">Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-[#c49a3c] focus:ring-2 focus:ring-[#c49a3c44]"
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="rounded-lg bg-[#c49a3c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b08930] transition disabled:opacity-50 whitespace-nowrap"
            >
              {adding ? "Adding..." : "Grant Access"}
            </button>
          </form>
          {!!addError && <p className="px-5 pb-3 text-sm text-red-600">{addError}</p>}
          {!!resetError && <p className="px-5 pb-3 text-sm text-red-600">{resetError}</p>}
        </div>

        {/* Users table */}
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden shadow-sm">
          <div className="border-b border-stone-100 bg-[#f3ead8] px-5 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-[#2f200f] text-sm">Authorized Users</h2>
            <span className="text-xs text-stone-500">{users.length} user{users.length !== 1 ? "s" : ""}</span>
          </div>
          <table className="min-w-full text-sm">
            <thead className="border-b border-stone-100 bg-stone-50 text-xs font-semibold uppercase text-stone-400">
              <tr>
                <th className="px-5 py-3 text-left">Email</th>
                <th className="px-5 py-3 text-left">Role</th>
                <th className="px-5 py-3 text-left">Added</th>
                <th className="px-5 py-3 text-right">Password</th>
                <th className="px-5 py-3 text-right">Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users.map((user) => (
                <tr key={user.email} className="hover:bg-stone-50">
                  <td className="px-5 py-3 font-medium text-stone-900">{user.email}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[user.role]}`}>
                      {roleLabel(user)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-stone-500">{formatDate(user.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    {resetEmail === user.email ? (
                      <span className="flex items-center justify-end gap-1">
                        <input
                          type="password"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          placeholder="New password"
                          className="rounded border border-stone-300 px-2 py-1 text-xs outline-none focus:border-[#c49a3c] w-32"
                        />
                        <button
                          onClick={handleResetPassword}
                          disabled={resetting}
                          className="text-xs font-semibold text-green-600 hover:text-green-800 transition disabled:opacity-50"
                        >
                          {resetting ? "Saving..." : "Save"}
                        </button>
                        <button onClick={() => { setResetEmail(null); setResetPassword(""); setResetError(""); }} className="text-xs font-semibold text-stone-400 hover:text-stone-700 transition">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => { setResetEmail(user.email); setResetPassword(""); setResetError(""); }}
                        className="text-xs font-semibold text-stone-400 hover:text-stone-700 transition"
                      >
                        Reset
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {user.email === "gregory.macleery@wmich.edu" ? (
                      <span className="text-xs text-stone-300">Protected</span>
                    ) : confirmRevoke === user.email ? (
                      <span className="flex items-center justify-end gap-1 text-sm">
                        <button
                          onClick={() => handleRevoke(user.email)}
                          disabled={revoking === user.email}
                          className="font-semibold text-red-600 hover:text-red-800 transition disabled:opacity-50"
                        >
                          {revoking === user.email ? "Revoking..." : "Confirm"}
                        </button>
                        <span className="text-stone-300">/</span>
                        <button onClick={() => setConfirmRevoke(null)} className="font-semibold text-stone-500 hover:text-stone-800 transition">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmRevoke(user.email)}
                        className="text-xs font-semibold text-red-400 hover:text-red-700 transition"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
