"use client";

import { Plane, QrCode, Download, Wallet } from "lucide-react";

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
    <div className="h-full overflow-auto no-scrollbar flex flex-col items-center py-6 px-4">
      {/* Boarding Pass Card */}
      <div className="w-full max-w-sm">
        {/* Top - Airline header */}
        <div className="bg-neutral-900 rounded-t-2xl border border-neutral-800 border-b-0 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wide">
                {ticket.airline}
              </p>
              <p className="text-sm font-semibold text-neutral-100 mt-0.5">
                {ticket.flightNumber}
              </p>
            </div>
            <div
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                ticket.status === "On Time"
                  ? "bg-green-500/10 text-green-500"
                  : ticket.status === "Delayed"
                  ? "bg-yellow-500/10 text-yellow-500"
                  : "bg-red-500/10 text-red-500"
              }`}
            >
              {ticket.status}
            </div>
          </div>
        </div>

        {/* Route section */}
        <div className="bg-neutral-900 border-x border-neutral-800 px-4 py-5">
          <div className="flex items-center justify-between">
            {/* Departure */}
            <div className="text-center">
              <p className="text-3xl font-bold text-neutral-100">
                {ticket.departure.code}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                {ticket.departure.city}
              </p>
              <p className="text-sm font-medium text-neutral-300 mt-2">
                {ticket.departure.time}
              </p>
            </div>

            {/* Flight path */}
            <div className="flex-1 px-4 flex flex-col items-center">
              <div className="flex items-center w-full">
                <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                <div className="flex-1 h-px bg-neutral-700 mx-1 relative">
                  <Plane className="h-4 w-4 text-orange-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90" />
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              </div>
              <p className="text-[10px] text-neutral-600 mt-1">
                {ticket.duration}
              </p>
            </div>

            {/* Arrival */}
            <div className="text-center">
              <p className="text-3xl font-bold text-neutral-100">
                {ticket.arrival.code}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                {ticket.arrival.city}
              </p>
              <p className="text-sm font-medium text-neutral-300 mt-2">
                {ticket.arrival.time}
              </p>
            </div>
          </div>

          <p className="text-xs text-neutral-600 text-center mt-3">
            {ticket.departure.date}
          </p>
        </div>

        {/* Perforated divider */}
        <div className="relative bg-neutral-900 border-x border-neutral-800 h-6">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-black border border-neutral-800" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-6 w-6 rounded-full bg-black border border-neutral-800" />
          <div className="absolute inset-x-6 top-1/2 border-t border-dashed border-neutral-700" />
        </div>

        {/* Details section */}
        <div className="bg-neutral-900 border-x border-neutral-800 px-4 py-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-neutral-600 uppercase">
                Passenger
              </p>
              <p className="text-xs font-medium text-neutral-200 mt-0.5">
                {ticket.passenger}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-600 uppercase">Seat</p>
              <p className="text-xs font-medium text-neutral-200 mt-0.5">
                {ticket.seat}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-600 uppercase">Class</p>
              <p className="text-xs font-medium text-neutral-200 mt-0.5">
                {ticket.class}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-600 uppercase">
                Terminal
              </p>
              <p className="text-xs font-medium text-neutral-200 mt-0.5">
                T{ticket.departure.terminal}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-600 uppercase">Gate</p>
              <p className="text-xs font-medium text-neutral-200 mt-0.5">
                {ticket.departure.gate}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-600 uppercase">
                Boarding
              </p>
              <p className="text-xs font-medium text-neutral-200 mt-0.5">
                Group {ticket.boardingGroup}
              </p>
            </div>
          </div>
        </div>

        {/* QR Code section */}
        <div className="bg-neutral-900 rounded-b-2xl border border-neutral-800 border-t-0 px-4 py-5 flex flex-col items-center">
          {/* Fake QR code */}
          <div className="h-28 w-28 bg-white rounded-xl p-2 mb-3">
            <div className="h-full w-full grid grid-cols-8 grid-rows-8 gap-px">
              {Array.from({ length: 64 }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-sm ${
                    Math.random() > 0.4 ? "bg-black" : "bg-white"
                  }`}
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-neutral-500">{ticket.confirmation}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mt-5 w-full max-w-sm">
        <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 transition-colors">
          <Download className="h-4 w-4" />
          Download
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 text-black text-sm font-medium hover:bg-orange-400 transition-colors">
          <Wallet className="h-4 w-4" />
          Add to Wallet
        </button>
      </div>
    </div>
  );
}
