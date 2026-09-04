"use client";

import React from "react";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";

type AuditLog = {
  id: number;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  item_added: "Item Added",
  item_edited: "Item Edited",
  item_deleted: "Item Deleted",
  request_created: "Request Created",
  request_fulfilled: "Request Fulfilled",
  request_recorded: "Request Recorded",
  request_deleted: "Request Deleted",
  access_granted: "Access Granted",
  access_revoked: "Access Revoked",
  password_reset: "Password Reset",
  user_login: "User Login",
  tag_created: "Tag Created",
  tag_deleted: "Tag Deleted",
};

const ACTION_COLORS: Record<string, string> = {
  item_added: "bg-green-100 text-green-800 border-green-200",
  item_edited: "bg-blue-100 text-blue-800 border-blue-200",
  item_deleted: "bg-red-100 text-red-800 border-red-200",
  request_created: "bg-amber-100 text-amber-800 border-amber-200",
  request_fulfilled: "bg-teal-100 text-teal-800 border-teal-200",
  request_recorded: "bg-purple-100 text-purple-800 border-purple-200",
  request_deleted: "bg-red-100 text-red-800 border-red-200",
  access_granted: "bg-indigo-100 text-indigo-800 border-indigo-200",
  access_revoked: "bg-orange-100 text-orange-800 border-orange-200",
  password_reset: "bg-yellow-100 text-yellow-800 border-yellow-200",
  user_login: "bg-sky-100 text-sky-800 border-sky-200",
  tag_created: "bg-green-100 text-green-800 border-green-200",
  tag_deleted: "bg-red-100 text-red-800 border-red-200",
};

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "item", label: "Inventory" },
  { value: "stock_request", label: "Requests" },
  { value: "user_access", label: "Access & Auth" },
  { value: "tag", label: "Tags" },
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function summarizeDetails(action: string, details: Record<string, unknown>): string {
  switch (action) {
    case "item_added":
      return `${details.name ?? details.sku} (${details.sku}) · ${details.on_hand_qty ?? 0} on hand`;
    case "item_edited":
      return `${details.name ?? details.sku} (${details.sku})`;
    case "item_deleted":
      return `SKU: ${details.sku}`;
    case "request_created":
      return `${details.item_count} item(s) from ${details.cafe_code} by ${details.requested_by_name}`;
    case "request_fulfilled":
      return `Request #${details.request_id} → ${details.status} by ${details.fulfilled_by_name}`;
    case "request_recorded":
      return `Request #${details.request_id} finalized by ${details.recorded_by_name}`;
    case "request_deleted":
      return `Request #${details.request_id}`;
    case "access_granted":
      return `${details.target_email} → ${details.role}`;
    case "access_revoked":
      return `${details.target_email}`;
    case "password_reset":
      return `Password reset for ${details.target_email}`;
    case "user_login":
      return `Logged in as ${details.role}`;
    case "tag_created":
      return `"${details.name}" (${details.slug})`;
    case "tag_deleted":
      return `"${details.name}" (${details.slug})`;
    default:
      return JSON.stringify(details);
  }
}

export default function AuditPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async (f: string, p: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/audit?filter=${f}&page=${p}`, { cache: "no-store" });
      if (!res.ok) { setError("Unable to load audit log."); return; }
      const data = (await res.json()) as { logs: AuditLog[]; total: number };
      setLogs(data.logs);
      setTotal(data.total);
    } catch {
      setError("Unable to load audit log right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const sessionRes = await fetch("/api/auth/session");
      if (!sessionRes.ok) { router.push("/"); return; }
      const sessionData = (await sessionRes.json()) as { role?: string };
      if (sessionData.role !== "admin") { router.push("/"); return; }
      await load("all", 1);
    }
    init();
  }, [router, load]);

  const handleFilter = async (f: string) => {
    setFilter(f);
    setPage(1);
    await load(f, 1);
  };

  const handlePage = async (p: number) => {
    setPage(p);
    await load(filter, p);
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <main className="min-h-screen bg-[#f6f1e8] text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <Image src="/wmu-logo.png" alt="WMU logo" width={160} height={46} className="h-auto w-[160px]" priority />
            <div>
              <p className="text-xs font-semibold uppercase text-stone-500">System</p>
              <h1 className="text-lg font-semibold text-[#2f200f]">Audit Log</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/admin" className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-stone-400 transition">Access Management</a>
            <a href="/" className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-stone-400 transition">Dashboard</a>
            <SignOutButton />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        {/* Filter tabs */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 rounded-lg border border-stone-200 bg-white p-1 shadow-sm">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleFilter(opt.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  filter === opt.value
                    ? "bg-[#c49a3c] text-white"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-stone-400">{total} event{total !== 1 ? "s" : ""}</span>
        </div>

        {!!error && <p className="text-sm text-red-600">{error}</p>}

        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-stone-400">Loading...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-sm font-medium text-stone-500">No audit events yet</p>
              <p className="text-xs text-stone-400">Events will appear here as the system is used.</p>
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="border-b border-stone-100 bg-stone-50 text-xs font-semibold uppercase text-stone-400">
                <tr>
                  <th className="px-5 py-3 text-left">When</th>
                  <th className="px-5 py-3 text-left">Who</th>
                  <th className="px-5 py-3 text-left">Action</th>
                  <th className="px-5 py-3 text-left">Details</th>
                  <th className="px-3 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {logs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr
                      className="hover:bg-stone-50 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <td className="px-5 py-3 text-stone-500 whitespace-nowrap text-xs">{formatDate(log.created_at)}</td>
                      <td className="px-5 py-3 text-stone-700 text-xs max-w-[160px] truncate">{log.actor_email}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ACTION_COLORS[log.action] ?? "bg-stone-100 text-stone-700 border-stone-200"}`}>
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-stone-600 text-xs">{summarizeDetails(log.action, log.details)}</td>
                      <td className="px-3 py-3 text-right text-stone-300 text-xs">{expandedId === log.id ? "▲" : "▼"}</td>
                    </tr>
                    {expandedId === log.id && (
                      <tr className="bg-stone-50">
                        <td colSpan={5} className="px-5 py-3">
                          <pre className="text-xs text-stone-600 whitespace-pre-wrap font-mono bg-stone-100 rounded-lg p-3 overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => handlePage(page - 1)}
              disabled={page === 1}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-600 hover:border-stone-400 transition disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-sm text-stone-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => handlePage(page + 1)}
              disabled={page === totalPages}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-600 hover:border-stone-400 transition disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
