"use client";

import { FileText, Download, Printer } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface DocumentViewProps {
  data?: any;
}

interface LineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
}

interface DocumentData {
  type?: "invoice" | "receipt" | "document";
  title?: string;
  number?: string;
  date?: string;
  dueDate?: string;
  from?: {
    name: string;
    address?: string;
    email?: string;
  };
  to?: {
    name: string;
    address?: string;
    email?: string;
  };
  items?: LineItem[];
  subtotal?: number;
  tax?: number;
  taxRate?: number;
  total?: number;
  notes?: string;
  status?: "paid" | "unpaid" | "overdue" | "draft";
  content?: string; // For generic document content
}

export function DocumentView({ data }: DocumentViewProps) {
  const doc: DocumentData = data || {
    type: "invoice",
    title: "Invoice",
    number: "INV-001",
    date: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    from: { name: "BACKBONE AI" },
    to: { name: "Client" },
    items: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    status: "draft",
  };

  const isInvoice = doc.type === "invoice" || doc.type === "receipt";

  const statusColors: Record<string, string> = {
    paid: "text-green-400 bg-green-500/10",
    unpaid: "text-yellow-400 bg-yellow-500/10",
    overdue: "text-red-400 bg-red-500/10",
    draft: "text-neutral-400 bg-neutral-500/10",
  };

  return (
    <div className="h-full overflow-auto no-scrollbar flex flex-col items-center py-8 px-5">
      {/* Document card */}
      <div className="w-full max-w-md animate-fade-up">
        {/* Header */}
        <div className="card-elevated p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-neutral-500" />
                <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium">
                  {doc.type || "Document"}
                </span>
              </div>
              <h2 className="text-[20px] font-bold text-white tracking-tight">
                {doc.title || "Document"}
              </h2>
              {doc.number && (
                <p className="text-[12px] text-neutral-500 font-mono mt-0.5">
                  {doc.number}
                </p>
              )}
            </div>
            {doc.status && (
              <span
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider ${
                  statusColors[doc.status] || statusColors.draft
                }`}
              >
                {doc.status}
              </span>
            )}
          </div>

          {/* From / To */}
          {(doc.from || doc.to) && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              {doc.from && (
                <div>
                  <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1">
                    From
                  </p>
                  <p className="text-[13px] text-white font-medium">
                    {doc.from.name}
                  </p>
                  {doc.from.address && (
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      {doc.from.address}
                    </p>
                  )}
                  {doc.from.email && (
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {doc.from.email}
                    </p>
                  )}
                </div>
              )}
              {doc.to && (
                <div>
                  <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1">
                    To
                  </p>
                  <p className="text-[13px] text-white font-medium">
                    {doc.to.name}
                  </p>
                  {doc.to.address && (
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      {doc.to.address}
                    </p>
                  )}
                  {doc.to.email && (
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      {doc.to.email}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Dates */}
          <div className="flex gap-4 mb-6">
            {doc.date && (
              <div>
                <p className="text-[10px] text-neutral-600 uppercase tracking-wider">
                  Date
                </p>
                <p className="text-[12px] text-neutral-300 mt-0.5">{doc.date}</p>
              </div>
            )}
            {doc.dueDate && (
              <div>
                <p className="text-[10px] text-neutral-600 uppercase tracking-wider">
                  Due Date
                </p>
                <p className="text-[12px] text-neutral-300 mt-0.5">
                  {doc.dueDate}
                </p>
              </div>
            )}
          </div>

          {/* Line items table */}
          {isInvoice && doc.items && doc.items.length > 0 && (
            <div className="mb-6">
              {/* Table header */}
              <div className="flex items-center px-3 py-2 border-b border-[#1f1f1f]">
                <span className="flex-1 text-[10px] text-neutral-600 uppercase tracking-wider font-medium">
                  Description
                </span>
                <span className="w-12 text-right text-[10px] text-neutral-600 uppercase tracking-wider font-medium">
                  Qty
                </span>
                <span className="w-20 text-right text-[10px] text-neutral-600 uppercase tracking-wider font-medium">
                  Price
                </span>
                <span className="w-20 text-right text-[10px] text-neutral-600 uppercase tracking-wider font-medium">
                  Amount
                </span>
              </div>

              {/* Table rows */}
              {doc.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center px-3 py-2.5 border-b border-[#141414]"
                >
                  <span className="flex-1 text-[12px] text-neutral-300">
                    {item.description}
                  </span>
                  <span className="w-12 text-right text-[12px] text-neutral-500 tabular-nums">
                    {item.quantity || 1}
                  </span>
                  <span className="w-20 text-right text-[12px] text-neutral-500 tabular-nums">
                    {item.unitPrice ? formatCurrency(item.unitPrice) : "—"}
                  </span>
                  <span className="w-20 text-right text-[12px] text-neutral-200 font-medium tabular-nums">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          {isInvoice && (
            <div className="space-y-2 pt-2 border-t border-[#1f1f1f]">
              {doc.subtotal !== undefined && (
                <div className="flex justify-between px-3">
                  <span className="text-[11px] text-neutral-500">Subtotal</span>
                  <span className="text-[12px] text-neutral-300 tabular-nums">
                    {formatCurrency(doc.subtotal)}
                  </span>
                </div>
              )}
              {doc.tax !== undefined && doc.tax > 0 && (
                <div className="flex justify-between px-3">
                  <span className="text-[11px] text-neutral-500">
                    Tax{doc.taxRate ? ` (${doc.taxRate}%)` : ""}
                  </span>
                  <span className="text-[12px] text-neutral-300 tabular-nums">
                    {formatCurrency(doc.tax)}
                  </span>
                </div>
              )}
              {doc.total !== undefined && (
                <div className="flex justify-between px-3 pt-2 border-t border-[#1f1f1f]">
                  <span className="text-[13px] text-white font-semibold">
                    Total
                  </span>
                  <span className="text-[16px] text-white font-bold tabular-nums">
                    {formatCurrency(doc.total)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Generic document content */}
          {!isInvoice && doc.content && (
            <div className="prose prose-invert prose-sm max-w-none">
              <p className="text-[13px] text-neutral-300 leading-relaxed whitespace-pre-wrap">
                {doc.content}
              </p>
            </div>
          )}

          {/* Notes */}
          {doc.notes && (
            <div className="mt-6 pt-4 border-t border-[#141414]">
              <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1">
                Notes
              </p>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                {doc.notes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2.5 mt-6 w-full max-w-md">
        <button className="flex-1 flex items-center justify-center gap-2 py-3 card-interactive text-neutral-400 text-[13px] active:scale-[0.98]">
          <Printer className="h-4 w-4" />
          Print
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white text-black text-[13px] font-semibold hover:bg-neutral-200 transition-colors active:scale-[0.98]">
          <Download className="h-4 w-4" />
          Download
        </button>
      </div>
    </div>
  );
}
