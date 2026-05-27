import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import type { Lead, Job } from "@shared/schema";
import {
  Users, Search, Filter, X, Phone, Mail, Globe, Instagram,
  Calendar, Clock, DollarSign, Disc3, ArrowUpRight, ChevronDown,
  Flame, Star, AlertCircle, CheckCircle2, XCircle, UserPlus,
  MessageSquare, ArrowRight, Tag, Building2, MapPin, ExternalLink,
  Plus, Save, Pencil,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  "new-lead":       { label: "New Lead",       color: "#00e5ff", bg: "rgba(0,229,255,0.12)" },
  "contacted":      { label: "Contacted",      color: "#ff9100", bg: "rgba(255,145,0,0.12)" },
  "quoting":        { label: "Quoting",        color: "#e040fb", bg: "rgba(224,64,251,0.12)" },
  "negotiating":    { label: "Negotiating",    color: "#ffea00", bg: "rgba(255,234,0,0.12)" },
  "won":            { label: "Won",            color: "#00e676", bg: "rgba(0,230,118,0.12)" },
  "lost":           { label: "Lost",           color: "#ff1744", bg: "rgba(255,23,68,0.12)" },
  "repeat-client":  { label: "Repeat Client",  color: "#00e676", bg: "rgba(0,230,118,0.12)" },
};

const SOURCE_CONFIG: Record<string, { label: string; icon: string }> = {
  "cold-call":      { label: "Cold Call",      icon: "📞" },
  "referral":       { label: "Referral",       icon: "🤝" },
  "website":        { label: "Website",        icon: "🌐" },
  "instagram":      { label: "Instagram",      icon: "📸" },
  "trade-show":     { label: "Trade Show",     icon: "🎪" },
  "word-of-mouth":  { label: "Word of Mouth",  icon: "💬" },
  "returning":      { label: "Returning",      icon: "🔄" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  "hot":    { label: "Hot",    color: "#ff1744" },
  "normal": { label: "Normal", color: "#ff9100" },
  "low":    { label: "Low",    color: "#546e7a" },
};

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return "—";
  return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 0 });
}

// ─── Add / Edit Lead Modal ───────────────────────────────────────────────
function LeadFormModal({
  lead,
  onClose,
  onSaved,
}: {
  lead: Partial<Lead> | null; // null = new lead
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = lead && lead.id;
  const [form, setForm] = useState({
    contactName: lead?.contactName || "",
    companyName: lead?.companyName || "",
    email: lead?.email || "",
    phone: lead?.phone || "",
    city: lead?.city || "",
    state: lead?.state || "",
    status: lead?.status || "new-lead",
    source: lead?.source || "cold-call",
    priority: lead?.priority || "normal",
    interestedFormat: lead?.interestedFormat || "",
    interestedQuantity: lead?.interestedQuantity ?? "",
    interestedColor: lead?.interestedColor || "",
    interestedServices: lead?.interestedServices || "",
    estimatedValue: lead?.estimatedValue ?? "",
    notes: lead?.notes || "",
    nextFollowUp: lead?.nextFollowUp || "",
    tags: lead?.tags || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contactName.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        interestedQuantity: form.interestedQuantity ? Number(form.interestedQuantity) : null,
        estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null,
        companyName: form.companyName || null,
        email: form.email || null,
        phone: form.phone || null,
        city: form.city || null,
        state: form.state || null,
        interestedFormat: form.interestedFormat || null,
        interestedColor: form.interestedColor || null,
        interestedServices: form.interestedServices || null,
        notes: form.notes || null,
        nextFollowUp: form.nextFollowUp || null,
        tags: form.tags || null,
        referredBy: lead?.referredBy || null,
        linkedJobIds: lead?.linkedJobIds || null,
        communicationLog: lead?.communicationLog || null,
        lastContactDate: lead?.lastContactDate || null,
        createdDate: lead?.createdDate || new Date().toISOString().slice(0, 10),
      };

      if (isEdit) {
        await apiRequest("PATCH", `/api/leads/${lead!.id}`, payload);
      } else {
        await apiRequest("POST", "/api/leads", payload);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      onSaved();
      onClose();
    } catch (err) {
      console.error("Save failed", err);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#00e5ff]/30 transition-colors";
  const selectCls = "w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/60 focus:outline-none appearance-none cursor-pointer";
  const labelCls = "text-[10px] font-semibold tracking-[0.12em] uppercase text-white/30 mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[600px] max-h-[85vh] overflow-y-auto rounded-xl border border-white/[0.06]"
        style={{ background: "linear-gradient(180deg, #0c0d12 0%, #08090c 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-white/[0.06] px-6 py-4" style={{ background: "rgba(12,13,18,0.95)", backdropFilter: "blur(12px)" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display font-bold text-white/95">
              {isEdit ? "Edit Lead" : "New Lead"}
            </h2>
            <button data-testid="close-lead-form" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors">
              <X className="w-4 h-4 text-white/50" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className={labelCls}>Contact Name *</label>
              <input data-testid="input-contactName" type="text" required className={inputCls} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Full name" />
            </div>
            <div>
              <label className={labelCls}>Company</label>
              <input data-testid="input-companyName" type="text" className={inputCls} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Company / Label" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className={labelCls}>Email</label>
              <input data-testid="input-email" type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input data-testid="input-phone" type="text" className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className={labelCls}>City</label>
              <input type="text" className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input type="text" className={inputCls} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="State" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className={labelCls}>Status</label>
              <select data-testid="select-status" className={selectCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Source</label>
              <select data-testid="select-source" className={selectCls} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select data-testid="select-priority" className={selectCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="hot">Hot</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Vinyl Interest */}
          <div className="border-t border-white/[0.06] pt-4">
            <h3 className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30 mb-3">Vinyl Interest</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className={labelCls}>Format</label>
                <select className={selectCls} value={form.interestedFormat} onChange={(e) => setForm({ ...form, interestedFormat: e.target.value })}>
                  <option value="">—</option>
                  <option value="7&quot;">7"</option>
                  <option value="10&quot;">10"</option>
                  <option value="12&quot;">12"</option>
                  <option value="12&quot; LP">12" LP</option>
                  <option value="12&quot; 2xLP">12" 2xLP</option>
                  <option value="7&quot; box set">7" box set</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Quantity</label>
                <input type="number" className={inputCls} value={form.interestedQuantity} onChange={(e) => setForm({ ...form, interestedQuantity: e.target.value })} placeholder="e.g. 500" />
              </div>
              <div>
                <label className={labelCls}>Color</label>
                <input type="text" className={inputCls} value={form.interestedColor} onChange={(e) => setForm({ ...form, interestedColor: e.target.value })} placeholder="e.g. Black, Splatter" />
              </div>
              <div>
                <label className={labelCls}>Estimated Value</label>
                <input type="number" className={inputCls} value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} placeholder="$" />
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Follow Up Date</label>
            <input type="date" className={inputCls} value={form.nextFollowUp} onChange={(e) => setForm({ ...form, nextFollowUp: e.target.value })} />
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea data-testid="input-notes" className={inputCls + " min-h-[80px] resize-y"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes about this lead..." />
          </div>

          <div>
            <label className={labelCls}>Tags (comma-separated)</label>
            <input type="text" className={inputCls} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="hip-hop, indie, vinyl-only" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              data-testid="save-lead-btn"
              type="submit"
              disabled={saving || !form.contactName.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-40"
              style={{ background: "rgba(0,229,255,0.15)", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.3)" }}
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isEdit ? "Save Changes" : "Add Lead"}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Lead Detail Panel (editable) ─────────────────────────────────────────
function LeadDetailPanel({
  lead,
  jobs,
  onClose,
  onEdit,
}: {
  lead: Lead;
  jobs: Job[];
  onClose: () => void;
  onEdit: (lead: Lead) => void;
}) {
  const statusCfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG["new-lead"];
  const sourceCfg = SOURCE_CONFIG[lead.source] || { label: lead.source, icon: "📋" };
  const priorityCfg = PRIORITY_CONFIG[lead.priority || "normal"];
  const commLog = (lead.communicationLog as any[]) || [];
  const linkedJobs = lead.linkedJobIds
    ? jobs.filter((j) => lead.linkedJobIds!.split(",").includes(j.jobId))
    : [];
  const tags = lead.tags ? lead.tags.split(",") : [];
  const daysLastContact = daysSince(lead.lastContactDate);
  const daysToFollowUp = daysUntil(lead.nextFollowUp);

  // Inline-edit for status and notes
  const [editStatus, setEditStatus] = useState(lead.status);
  const [editNotes, setEditNotes] = useState(lead.notes || "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleQuickSave = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/leads/${lead.id}`, {
        status: editStatus,
        notes: editNotes || null,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      setDirty(false);
    } catch (err) {
      console.error("Quick save failed", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative h-full w-full max-w-[640px] overflow-y-auto border-l border-white/[0.06]"
        style={{ background: "linear-gradient(180deg, #0c0d12 0%, #08090c 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-white/[0.06] px-6 py-4" style={{ background: "rgba(12,13,18,0.95)", backdropFilter: "blur(12px)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                {lead.contactName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-lg font-display font-bold text-white/95">{lead.contactName}</h2>
                {lead.companyName && (
                  <div className="flex items-center gap-1 text-xs text-white/50">
                    <Building2 className="w-3 h-3" />
                    {lead.companyName}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                data-testid="edit-lead-full"
                onClick={() => onEdit(lead)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
                title="Edit all fields"
              >
                <Pencil className="w-4 h-4 text-[#00e5ff]/60 hover:text-[#00e5ff]" />
              </button>
              <button
                data-testid="close-lead-detail"
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>
          </div>

          {/* Status + Priority + Source row */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide uppercase" style={{ background: statusCfg.bg, color: statusCfg.color }}>
              {statusCfg.label}
            </span>
            {lead.priority === "hot" && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide uppercase" style={{ background: "rgba(255,23,68,0.12)", color: "#ff1744" }}>
                <Flame className="w-3 h-3" /> Hot
              </span>
            )}
            <span className="px-2 py-0.5 rounded text-[11px] text-white/50 bg-white/[0.06]">
              {sourceCfg.icon} {sourceCfg.label}
            </span>
            {lead.referredBy && (
              <span className="px-2 py-0.5 rounded text-[11px] text-white/50 bg-white/[0.06]">
                via {lead.referredBy}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Quick Edit: Status + Notes */}
          <section className="rounded-lg border border-[#00e5ff]/20 bg-[#00e5ff]/[0.03] p-4 space-y-3">
            <h3 className="text-[10px] font-semibold tracking-[0.15em] uppercase text-[#00e5ff]/60 flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Quick Edit
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-white/30 uppercase mb-1 block">Status</label>
                <select
                  data-testid="quick-edit-status"
                  value={editStatus}
                  onChange={(e) => { setEditStatus(e.target.value); setDirty(true); }}
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white/70 focus:outline-none appearance-none cursor-pointer"
                >
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-white/30 uppercase mb-1 block">Notes</label>
              <textarea
                data-testid="quick-edit-notes"
                value={editNotes}
                onChange={(e) => { setEditNotes(e.target.value); setDirty(true); }}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/70 placeholder:text-white/20 focus:outline-none focus:border-[#00e5ff]/30 resize-y min-h-[60px]"
                placeholder="Notes..."
              />
            </div>
            {dirty && (
              <button
                data-testid="quick-save-btn"
                onClick={handleQuickSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{ background: "rgba(0,229,255,0.15)", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.3)" }}
              >
                {saving ? (
                  <div className="w-3 h-3 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-3 h-3" />
                )}
                Save
              </button>
            )}
          </section>

          {/* Contact Info */}
          <section>
            <h3 className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30 mb-3">Contact Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:border-[#00e5ff]/30 transition-colors group">
                  <Mail className="w-4 h-4 text-[#00e5ff]/60 group-hover:text-[#00e5ff]" />
                  <span className="text-xs text-white/70 truncate group-hover:text-white/90">{lead.email}</span>
                </a>
              )}
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:border-[#00e5ff]/30 transition-colors group">
                  <Phone className="w-4 h-4 text-[#00e5ff]/60 group-hover:text-[#00e5ff]" />
                  <span className="text-xs text-white/70 group-hover:text-white/90">{lead.phone}</span>
                </a>
              )}
              {(lead.city || lead.state) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                  <MapPin className="w-4 h-4 text-white/30" />
                  <span className="text-xs text-white/50">{[lead.city, lead.state].filter(Boolean).join(", ")}</span>
                </div>
              )}
            </div>
          </section>

          {/* Key Dates */}
          <section>
            <h3 className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30 mb-3">Key Dates</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <div className="text-[10px] text-white/30 uppercase mb-1">Created</div>
                <div className="text-xs text-white/70 tabular-nums">{formatDate(lead.createdDate)}</div>
              </div>
              <div className="px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <div className="text-[10px] text-white/30 uppercase mb-1">Last Contact</div>
                <div className="text-xs text-white/70 tabular-nums">{formatDate(lead.lastContactDate)}</div>
                {daysLastContact != null && daysLastContact > 30 && (
                  <div className="text-[10px] text-[#ff9100] mt-0.5">{daysLastContact}d ago</div>
                )}
              </div>
              <div className={`px-3 py-2.5 rounded-lg border ${daysToFollowUp != null && daysToFollowUp <= 2 ? "bg-[#ff1744]/[0.06] border-[#ff1744]/20" : daysToFollowUp != null && daysToFollowUp <= 7 ? "bg-[#ff9100]/[0.06] border-[#ff9100]/20" : "bg-white/[0.04] border-white/[0.06]"}`}>
                <div className="text-[10px] text-white/30 uppercase mb-1">Follow Up</div>
                <div className="text-xs text-white/70 tabular-nums">{formatDate(lead.nextFollowUp)}</div>
                {daysToFollowUp != null && daysToFollowUp <= 0 && (
                  <div className="text-[10px] text-[#ff1744] font-semibold mt-0.5">OVERDUE</div>
                )}
                {daysToFollowUp != null && daysToFollowUp > 0 && daysToFollowUp <= 7 && (
                  <div className="text-[10px] text-[#ff9100] mt-0.5">In {daysToFollowUp}d</div>
                )}
              </div>
            </div>
          </section>

          {/* Vinyl Interest */}
          {(lead.interestedFormat || lead.interestedQuantity || lead.interestedColor || lead.interestedServices) && (
            <section>
              <h3 className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30 mb-3">Vinyl Interest</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {lead.interestedFormat && (
                  <div className="px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                    <div className="text-[10px] text-white/30 uppercase mb-1">Format</div>
                    <div className="text-sm text-white/80 font-medium flex items-center gap-1"><Disc3 className="w-3.5 h-3.5 text-[#00e5ff]/60" />{lead.interestedFormat}</div>
                  </div>
                )}
                {lead.interestedQuantity && (
                  <div className="px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                    <div className="text-[10px] text-white/30 uppercase mb-1">Quantity</div>
                    <div className="text-sm text-white/80 font-medium">{lead.interestedQuantity} units</div>
                  </div>
                )}
                {lead.interestedColor && (
                  <div className="px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                    <div className="text-[10px] text-white/30 uppercase mb-1">Color</div>
                    <div className="text-sm text-white/80 font-medium">{lead.interestedColor}</div>
                  </div>
                )}
                {lead.interestedServices && (
                  <div className="px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                    <div className="text-[10px] text-white/30 uppercase mb-1">Services</div>
                    <div className="text-sm text-white/80 font-medium capitalize">{lead.interestedServices.replace(/-/g, " ")}</div>
                  </div>
                )}
              </div>
              {lead.estimatedValue && (
                <div className="mt-3 px-3 py-2.5 rounded-lg border border-[#00e676]/20 bg-[#00e676]/[0.06] flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[#00e676]" />
                  <span className="text-sm font-bold text-[#00e676] tabular-nums">{formatCurrency(lead.estimatedValue)}</span>
                  <span className="text-[10px] text-white/40 uppercase">estimated value</span>
                </div>
              )}
            </section>
          )}

          {/* Communication Log */}
          {commLog.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30 mb-3">Communication Log</h3>
              <div className="space-y-0">
                {commLog.map((entry: any, idx: number) => (
                  <div key={idx} className="flex gap-3 py-2.5 border-b border-white/[0.04] last:border-0">
                    <div className="flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${entry.type === "email" ? "bg-[#00e5ff]" : entry.type === "call" ? "bg-[#00e676]" : entry.type === "in-person" ? "bg-[#e040fb]" : "bg-[#ff9100]"}`} />
                      {idx < commLog.length - 1 && <div className="w-px flex-1 bg-white/[0.06] mt-1" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/40 tabular-nums">{formatDate(entry.date)}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 uppercase">{entry.type}</span>
                      </div>
                      <p className="text-xs text-white/60 mt-0.5">{entry.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Linked Jobs */}
          {linkedJobs.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30 mb-3">Linked Jobs</h3>
              <div className="space-y-2">
                {linkedJobs.map((job) => (
                  <div key={job.id} className="px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-mono text-[#00e5ff]">{job.jobId}</div>
                      <div className="text-[10px] text-white/40 mt-0.5">{job.format} · {job.vinylColor} · {job.quantity} units</div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                      job.status === "delivered" || job.status === "closed" ? "bg-[#00e676]/10 text-[#00e676]" :
                      job.status === "in-production" ? "bg-[#00e5ff]/10 text-[#00e5ff]" :
                      "bg-white/[0.06] text-white/50"
                    }`}>
                      {job.status.replace(/-/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/30 mb-3">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded text-[10px] text-white/50 bg-white/[0.06] border border-white/[0.04]">
                    {tag.trim()}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────
export default function Leads() {
  const { data: leads = [], isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
  });
  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [sortField, setSortField] = useState<string>("nextFollowUp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);

  const { toast } = useToast();
  const [sendingDigest, setSendingDigest] = useState(false);

  async function handleSendDigest() {
    setSendingDigest(true);
    try {
      const res = await apiRequest("POST", "/api/alerts/send-digest");
      const data = await res.json();
      toast({
        title: data.sent ? "Digest enviado" : "Nada que enviar",
        description: data.sent
          ? `${data.overdueLeads} follow-ups + ${data.overdueMaintenance} mantenimiento`
          : data.reason || "Sin vencidos",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "No se pudo enviar el digest",
        variant: "destructive",
      });
    } finally {
      setSendingDigest(false);
    }
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "estimatedValue" ? "desc" : "asc");
    }
  };

  const filtered = useMemo(() => {
    let result = [...leads];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.contactName.toLowerCase().includes(q) ||
          (l.companyName && l.companyName.toLowerCase().includes(q)) ||
          (l.email && l.email.toLowerCase().includes(q)) ||
          (l.notes && l.notes.toLowerCase().includes(q)) ||
          (l.tags && l.tags.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== "all") result = result.filter((l) => l.status === statusFilter);
    if (sourceFilter !== "all") result = result.filter((l) => l.source === sourceFilter);
    if (priorityFilter !== "all") result = result.filter((l) => l.priority === priorityFilter);

    result.sort((a, b) => {
      let va: any = (a as any)[sortField];
      let vb: any = (b as any)[sortField];
      if (sortField === "estimatedValue") {
        va = va ?? 0;
        vb = vb ?? 0;
        return sortDir === "asc" ? va - vb : vb - va;
      }
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });

    return result;
  }, [leads, search, statusFilter, sourceFilter, priorityFilter, sortField, sortDir]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[l.status] = (c[l.status] || 0) + 1;
    return c;
  }, [leads]);

  const pipelineValue = useMemo(() => {
    return leads
      .filter((l) => !["won", "lost", "repeat-client"].includes(l.status))
      .reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
  }, [leads]);

  const overdueFollowUps = useMemo(() => {
    return leads.filter((l) => {
      const d = daysUntil(l.nextFollowUp);
      return d != null && d <= 0 && !["won", "lost"].includes(l.status);
    }).length;
  }, [leads]);

  const hotLeads = useMemo(() => leads.filter((l) => l.priority === "hot" && !["won", "lost"].includes(l.status)).length, [leads]);

  if (leadsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const SortHeader = ({ field, label, align }: { field: string; label: string; align?: string }) => (
    <button
      onClick={() => handleSort(field)}
      className={`flex items-center gap-1 text-[10px] font-semibold tracking-[0.12em] uppercase transition-colors ${
        sortField === field ? "text-[#00e5ff]" : "text-white/30 hover:text-white/50"
      } ${align === "right" ? "ml-auto" : ""}`}
    >
      {label}
      {sortField === field && (
        <span className="text-[8px]">{sortDir === "asc" ? "▲" : "▼"}</span>
      )}
    </button>
  );

  return (
    <div className="space-y-6" data-testid="leads-page">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold text-white/95">Lead Tracker</h1>
          <p className="text-sm text-white/40 mt-0.5">Moe's CRM — vinyl sales pipeline</p>
        </div>
        <button
          data-testid="add-lead-btn"
          onClick={() => { setEditLead(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all hover:brightness-110"
          style={{ background: "rgba(0,229,255,0.15)", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.3)" }}
        >
          <Plus className="w-4 h-4" />
          New Lead
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="glow-card rounded-xl px-4 py-3 border border-white/[0.06]" style={{ background: "rgba(18,19,26,0.8)" }}>
          <div className="text-[10px] font-medium tracking-[0.12em] uppercase text-white/30">Total Leads</div>
          <div className="text-2xl font-bold text-white/90 tabular-nums mt-1">{leads.length}</div>
        </div>
        <div className="glow-card rounded-xl px-4 py-3 border border-white/[0.06]" style={{ background: "rgba(18,19,26,0.8)" }}>
          <div className="text-[10px] font-medium tracking-[0.12em] uppercase text-white/30">Pipeline Value</div>
          <div className="text-2xl font-bold text-[#00e676] tabular-nums mt-1">{formatCurrency(pipelineValue)}</div>
          <div className="text-[10px] text-white/30 mt-0.5">Active leads</div>
        </div>
        <div className="glow-card rounded-xl px-4 py-3 border border-white/[0.06]" style={{ background: "rgba(18,19,26,0.8)" }}>
          <div className="text-[10px] font-medium tracking-[0.12em] uppercase text-white/30 flex items-center gap-1"><Flame className="w-3 h-3 text-[#ff1744]" /> Hot Leads</div>
          <div className="text-2xl font-bold text-[#ff1744] tabular-nums mt-1">{hotLeads}</div>
        </div>
        <div className={`glow-card rounded-xl px-4 py-3 border ${overdueFollowUps > 0 ? "border-[#ff1744]/30" : "border-white/[0.06]"}`} style={{ background: overdueFollowUps > 0 ? "rgba(255,23,68,0.04)" : "rgba(18,19,26,0.8)" }}>
          <div className="text-[10px] font-medium tracking-[0.12em] uppercase text-white/30">Overdue Follow-ups</div>
          <div className={`text-2xl font-bold tabular-nums mt-1 ${overdueFollowUps > 0 ? "text-[#ff1744]" : "text-white/90"}`}>{overdueFollowUps}</div>
          <button
            data-testid="send-digest"
            onClick={handleSendDigest}
            disabled={sendingDigest}
            className="rounded-lg px-3 py-2 text-xs font-medium text-white/80 border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] transition-colors disabled:opacity-40"
          >
            {sendingDigest ? "Enviando…" : "Enviar digest ahora"}
          </button>
        </div>
        <div className="glow-card rounded-xl px-4 py-3 border border-white/[0.06]" style={{ background: "rgba(18,19,26,0.8)" }}>
          <div className="text-[10px] font-medium tracking-[0.12em] uppercase text-white/30">Won / Closed</div>
          <div className="text-2xl font-bold text-[#00e676] tabular-nums mt-1">{(counts["won"] || 0) + (counts["repeat-client"] || 0)}</div>
        </div>
      </div>

      {/* Pipeline Status Bar */}
      <div className="flex items-center gap-1 rounded-xl p-1 bg-white/[0.02] border border-white/[0.06]">
        {["new-lead", "contacted", "quoting", "negotiating", "won", "repeat-client", "lost"].map((s) => {
          const cfg = STATUS_CONFIG[s];
          const count = counts[s] || 0;
          return (
            <button
              key={s}
              data-testid={`pipeline-filter-${s}`}
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                statusFilter === s ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
              }`}
              style={{ color: statusFilter === s ? cfg.color : undefined }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
              {cfg.label}
              <span className="text-white/30 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            data-testid="lead-search"
            type="text"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#00e5ff]/30 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-white/30 hover:text-white/60" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
        <select
          data-testid="source-filter"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white/60 focus:outline-none appearance-none cursor-pointer flex-1 sm:flex-none"
        >
          <option value="all">All Sources</option>
          {Object.entries(SOURCE_CONFIG).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <select
          data-testid="priority-filter"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white/60 focus:outline-none appearance-none cursor-pointer flex-1 sm:flex-none"
        >
          <option value="all">All Priorities</option>
          <option value="hot">Hot</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        </div>
      </div>

      {/* Results count */}
      <div className="text-[11px] text-white/30">
        {filtered.length} lead{filtered.length !== 1 ? "s" : ""} shown
      </div>

      {/* Lead Table — Desktop: grid table, Mobile: card list */}
      {/* Desktop table (hidden on mobile) */}
      <div className="hidden md:block rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: "rgba(18,19,26,0.6)" }}>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_120px] gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
          <SortHeader field="contactName" label="Contact" />
          <SortHeader field="status" label="Status" />
          <SortHeader field="source" label="Source" />
          <SortHeader field="nextFollowUp" label="Follow Up" />
          <SortHeader field="estimatedValue" label="Value" align="right" />
          <SortHeader field="lastContactDate" label="Last Contact" align="right" />
        </div>
        {filtered.map((lead) => {
          const statusCfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG["new-lead"];
          const sourceCfg = SOURCE_CONFIG[lead.source] || { label: lead.source, icon: "\uD83D\uDCCB" };
          const followUpDays = daysUntil(lead.nextFollowUp);
          const lastDays = daysSince(lead.lastContactDate);
          return (
            <div
              key={lead.id}
              data-testid={`lead-row-${lead.id}`}
              onClick={() => setSelectedLead(lead)}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_120px] gap-3 px-4 py-3 border-b border-white/[0.04] cursor-pointer hover:bg-white/[0.03] transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                  {lead.contactName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-white/80 font-medium truncate group-hover:text-white/95">{lead.contactName}</span>
                    {lead.priority === "hot" && <Flame className="w-3 h-3 text-[#ff1744] flex-shrink-0" />}
                  </div>
                  {lead.companyName && <div className="text-[11px] text-white/35 truncate">{lead.companyName}</div>}
                  {!lead.companyName && lead.email && <div className="text-[11px] text-white/35 truncate">{lead.email}</div>}
                </div>
              </div>
              <div className="flex items-center">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide" style={{ background: statusCfg.bg, color: statusCfg.color }}>{statusCfg.label}</span>
              </div>
              <div className="flex items-center text-[11px] text-white/50"><span className="mr-1">{sourceCfg.icon}</span> {sourceCfg.label}</div>
              <div className="flex items-center">
                {lead.nextFollowUp ? (
                  <div>
                    <div className="text-xs text-white/60 tabular-nums">{formatDate(lead.nextFollowUp)}</div>
                    {followUpDays != null && followUpDays <= 0 && <div className="text-[10px] text-[#ff1744] font-semibold">OVERDUE</div>}
                    {followUpDays != null && followUpDays > 0 && followUpDays <= 3 && <div className="text-[10px] text-[#ff9100]">In {followUpDays}d</div>}
                  </div>
                ) : <span className="text-[11px] text-white/20">—</span>}
              </div>
              <div className="flex items-center justify-end">
                <span className={`text-sm tabular-nums font-medium ${lead.estimatedValue ? "text-white/70" : "text-white/20"}`}>{formatCurrency(lead.estimatedValue)}</span>
              </div>
              <div className="flex items-center justify-end">
                <div className="text-right">
                  <div className="text-xs text-white/50 tabular-nums">{formatDate(lead.lastContactDate)}</div>
                  {lastDays != null && lastDays > 60 && <div className="text-[10px] text-[#ff1744]">{lastDays}d ago</div>}
                  {lastDays != null && lastDays > 30 && lastDays <= 60 && <div className="text-[10px] text-[#ff9100]">{lastDays}d ago</div>}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="px-4 py-8 text-center text-sm text-white/30">No leads match your filters</div>}
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {filtered.map((lead) => {
          const statusCfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG["new-lead"];
          const followUpDays = daysUntil(lead.nextFollowUp);
          return (
            <div
              key={lead.id}
              data-testid={`lead-card-${lead.id}`}
              onClick={() => setSelectedLead(lead)}
              className="glow-card rounded-xl p-3 cursor-pointer active:scale-[0.98] transition-transform"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                  {lead.contactName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-white/85 font-medium truncate">{lead.contactName}</span>
                    {lead.priority === "hot" && <Flame className="w-3 h-3 text-[#ff1744] flex-shrink-0" />}
                  </div>
                  {lead.companyName && <div className="text-[11px] text-white/40 truncate">{lead.companyName}</div>}
                  <div className="flex items-center justify-between mt-2">
                    <span className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide" style={{ background: statusCfg.bg, color: statusCfg.color }}>{statusCfg.label}</span>
                    <span className="text-xs text-white/50 tabular-nums font-medium">{formatCurrency(lead.estimatedValue)}</span>
                  </div>
                  {lead.nextFollowUp && followUpDays != null && followUpDays <= 3 && (
                    <div className={`mt-1 text-[10px] font-semibold ${followUpDays <= 0 ? "text-[#ff1744]" : "text-[#ff9100]"}`}>
                      {followUpDays <= 0 ? "FOLLOW UP OVERDUE" : `Follow up in ${followUpDays}d`}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="py-8 text-center text-sm text-white/30">No leads match your filters</div>}
      </div>

      {/* Detail Panel */}
      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          jobs={jobs}
          onClose={() => setSelectedLead(null)}
          onEdit={(l) => { setSelectedLead(null); setEditLead(l); setShowForm(true); }}
        />
      )}

      {/* Add / Edit Form Modal */}
      {showForm && (
        <LeadFormModal
          lead={editLead}
          onClose={() => { setShowForm(false); setEditLead(null); }}
          onSaved={() => {}}
        />
      )}
    </div>
  );
}
