"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Moon, Zap, TrendingUp } from "lucide-react";

export function HealthView() {
  // TODO: Integrate with BACKBONE health API
  const mockHealthData = {
    readinessScore: 85,
    sleepScore: 78,
    activityScore: 92,
    lastNightSleep: 7.5,
    hrvAverage: 62,
    restingHeartRate: 58,
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* Readiness Score */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Readiness Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-5xl font-bold text-yellow-500">
            {mockHealthData.readinessScore}
          </div>
          <div className="text-sm text-slate-400 mt-2">
            You're ready for a productive day
          </div>
        </CardContent>
      </Card>

      {/* Sleep Data */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <Moon className="h-5 w-5 text-blue-500" />
            Sleep
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-slate-400">Score</div>
              <div className="text-2xl font-bold text-blue-500">
                {mockHealthData.sleepScore}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-400">Duration</div>
              <div className="text-2xl font-bold text-slate-100">
                {mockHealthData.lastNightSleep}h
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-500" />
            Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-slate-400">Score</div>
              <div className="text-2xl font-bold text-green-500">
                {mockHealthData.activityScore}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-400">HRV</div>
              <div className="text-2xl font-bold text-slate-100">
                {mockHealthData.hrvAverage}ms
              </div>
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-400">Resting HR</div>
            <div className="text-lg font-semibold text-slate-100">
              {mockHealthData.restingHeartRate} bpm
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
