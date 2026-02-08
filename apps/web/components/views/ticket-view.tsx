"use client";

import { Plane, Download, Wallet } from "lucide-react";

interface TicketViewProps {
  data?: any;
}

export function TicketView({ data }: TicketViewProps) {
  const ticket = data || {
    airline: "United Airlines",
    flightNumber: "UA 1234",
    departure: {
      city: "San Francisco",
      code: "SFO",
      time: "08:30 AM",
      date: "Feb 15, 2026",
      terminal: "3",
      gate: "B42",
    },
    arrival: {
      city: "New York",
      code: "JFK",
      time: "05:15 PM",
      date: "Feb 15, 2026",
      terminal: "7",
    },
    passenger: "Passenger",
    seat: "12A",
    class: "Economy Plus",
    boardingGroup: "2",
    confirmation: "ABC123",
    duration: "5h 45m",
    status: "On Time",
  };

  return (
    <div className="h-full overflow-auto no-scrollbar flex flex-col items-center py-8 px-5">
      {/* Boarding Pass Card */}
      <div className="w-full max-w-sm animate-fade-up">
        {/* Top - Airline header */}
        <div className="card-elevated rounded-b-none border-b-0 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-neutral-500 uppercase tracking-widest font-medium">
                {ticket.airline}
              </p>
              <p className="text-[14px] font-semibold text-white mt-1">
                {ticket.flightNumber}
              </p>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                ticket.status === "On Time"
                  ? "bg-green-500/10 text-green-400"
                  : ticket.status === "Delayed"
                  ? "bg-yellow-500/10 text-yellow-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {ticket.status}
            </div>
          </div>
        </div>

        {/* Route section */}
        <div className="bg-[#141414] border-x border-[#1f1f1f] px-5 py-6">
          <div className="flex items-center justify-between">
            {/* Departure */}
            <div className="text-center">
              <p className="text-[32px] font-bold text-white tracking-value">
                {ticket.departure.code}
              </p>
              <p className="text-[11px] text-neutral-500 mt-1">
                {ticket.departure.city}
              </p>
              <p className="text-[14px] font-semibold text-neutral-300 mt-2.5 tabular-nums">
                {ticket.departure.time}
              </p>
            </div>

            {/* Flight path */}
            <div className="flex-1 px-5 flex flex-col items-center">
              <div className="flex items-center w-full">
                <div className="h-2 w-2 rounded-full bg-orange-500" />
                <div className="flex-1 h-px bg-[#2a2a2a] mx-1.5 relative">
                  <Plane className="h-4 w-4 text-orange-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90" />
                </div>
                <div className="h-2 w-2 rounded-full bg-orange-500" />
              </div>
              <p className="text-[10px] text-neutral-600 mt-1.5 tabular-nums">
                {ticket.duration}
              </p>
            </div>

            {/* Arrival */}
            <div className="text-center">
              <p className="text-[32px] font-bold text-white tracking-value">
                {ticket.arrival.code}
              </p>
              <p className="text-[11px] text-neutral-500 mt-1">
                {ticket.arrival.city}
              </p>
              <p className="text-[14px] font-semibold text-neutral-300 mt-2.5 tabular-nums">
                {ticket.arrival.time}
              </p>
            </div>
          </div>

          <p className="text-[11px] text-neutral-600 text-center mt-4 tabular-nums">
            {ticket.departure.date}
          </p>
        </div>

        {/* Perforated divider */}
        <div className="relative bg-[#141414] border-x border-[#1f1f1f] h-6">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-black border border-[#1f1f1f]" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-6 w-6 rounded-full bg-black border border-[#1f1f1f]" />
          <div className="absolute inset-x-6 top-1/2 border-t border-dashed border-[#2a2a2a]" />
        </div>

        {/* Details section */}
        <div className="bg-[#141414] border-x border-[#1f1f1f] px-5 py-5">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Passenger", value: ticket.passenger },
              { label: "Seat", value: ticket.seat },
              { label: "Class", value: ticket.class },
              { label: "Terminal", value: `T${ticket.departure.terminal}` },
              { label: "Gate", value: ticket.departure.gate },
              { label: "Boarding", value: `Group ${ticket.boardingGroup}` },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[10px] text-neutral-600 uppercase tracking-wider">
                  {item.label}
                </p>
                <p className="text-[12px] font-medium text-neutral-200 mt-0.5">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* QR Code section */}
        <div className="card-elevated rounded-t-none border-t-0 px-5 py-6 flex flex-col items-center">
          <div className="h-28 w-28 bg-white rounded-xl p-2.5 mb-3">
            <div className="h-full w-full grid grid-cols-8 grid-rows-8 gap-px">
              {Array.from({ length: 64 }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-[1px] ${
                    Math.random() > 0.4 ? "bg-black" : "bg-white"
                  }`}
                />
              ))}
            </div>
          </div>
          <p className="text-[12px] text-neutral-500 font-mono tracking-wider">
            {ticket.confirmation}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2.5 mt-6 w-full max-w-sm">
        <button className="flex-1 flex items-center justify-center gap-2 py-3 card-interactive text-neutral-400 text-[13px] active:scale-[0.98]">
          <Download className="h-4 w-4" />
          Download
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-orange-500 text-black text-[13px] font-semibold hover:bg-orange-400 transition-colors active:scale-[0.98]">
          <Wallet className="h-4 w-4" />
          Add to Wallet
        </button>
      </div>
    </div>
  );
}
