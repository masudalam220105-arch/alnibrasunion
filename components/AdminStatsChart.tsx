'use client';

import React, { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import type { ActivityLog, UserProfile } from '@/lib/types';
import { computeActivityGrowthOverTime } from '@/lib/portal-logic';
import { TrendingUp, Activity, CalendarCheck, ShieldCheck } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

interface AdminStatsChartProps {
  users: UserProfile[];
  activityLogs: ActivityLog[];
  publishedAnnouncements: number;
  draftAnnouncements: number;
  publishedNotices: number;
}

export function AdminStatsChart({
  users,
  activityLogs = [],
  publishedAnnouncements,
  draftAnnouncements,
  publishedNotices,
}: AdminStatsChartProps) {
  const [viewMetric, setViewMetric] = useState<'both' | 'cumulative' | 'daily'>('both');

  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);
  const activeCount = useMemo(() => students.filter((u) => u.status === 'active').length, [students]);
  const inactiveCount = useMemo(() => students.filter((u) => u.status === 'inactive').length, [students]);

  // Aggregate activity growth points chronologically
  const timelinePoints = useMemo(() => {
    return computeActivityGrowthOverTime(activityLogs, users);
  }, [activityLogs, users]);

  // Derived metrics
  const totalStudentEvents = useMemo(() => {
    if (timelinePoints.length === 0) return 0;
    return timelinePoints[timelinePoints.length - 1].cumulativeStudentEvents;
  }, [timelinePoints]);

  const peakDayEvents = useMemo(() => {
    if (timelinePoints.length === 0) return 0;
    return Math.max(...timelinePoints.map((p) => p.studentEvents));
  }, [timelinePoints]);

  const timelineLabels = timelinePoints.map((p) => p.displayDate);
  const dailyStudentData = timelinePoints.map((p) => p.studentEvents);
  const cumulativeData = timelinePoints.map((p) => p.cumulativeStudentEvents);

  // Line Chart Configuration
  const lineDatasets = [];

  if (viewMetric === 'both' || viewMetric === 'cumulative') {
    lineDatasets.push({
      label: 'Cumulative Activity Growth',
      data: cumulativeData,
      borderColor: '#0B192C',
      backgroundColor: 'rgba(11, 25, 44, 0.08)',
      fill: true,
      tension: 0.35,
      borderWidth: 3,
      pointBackgroundColor: '#C5A059',
      pointBorderColor: '#0B192C',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      yAxisID: 'yCumulative',
    });
  }

  if (viewMetric === 'both' || viewMetric === 'daily') {
    lineDatasets.push({
      label: 'Daily Student Actions',
      data: dailyStudentData,
      borderColor: '#C5A059',
      backgroundColor: 'rgba(197, 160, 89, 0.15)',
      fill: viewMetric === 'daily',
      tension: 0.3,
      borderWidth: 2.5,
      borderDash: viewMetric === 'both' ? [4, 4] : [],
      pointBackgroundColor: '#0B192C',
      pointBorderColor: '#C5A059',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      yAxisID: 'yDaily',
    });
  }

  const lineChartData = {
    labels: timelineLabels.length > 0 ? timelineLabels : ['No Activity Recorded'],
    datasets: lineDatasets,
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          boxWidth: 12,
          usePointStyle: true,
          pointStyle: 'circle',
          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
          color: '#334155',
        },
      },
      tooltip: {
        backgroundColor: '#0B192C',
        titleFont: { size: 12, weight: 'bold' as const },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 6,
      },
    },
    scales: {
      x: {
        grid: { color: '#F1F5F9' },
        ticks: { color: '#64748B', font: { size: 11 } },
      },
      yDaily: {
        type: 'linear' as const,
        display: viewMetric === 'both' || viewMetric === 'daily',
        position: 'left' as const,
        beginAtZero: true,
        grid: { color: '#F1F5F9' },
        ticks: {
          precision: 0,
          color: '#C5A059',
          font: { size: 11 },
        },
        title: {
          display: true,
          text: 'Daily Actions',
          color: '#856404',
          font: { size: 11, weight: 'bold' as const },
        },
      },
      yCumulative: {
        type: 'linear' as const,
        display: viewMetric === 'both' || viewMetric === 'cumulative',
        position: 'right' as const,
        beginAtZero: true,
        grid: { drawOnChartArea: false },
        ticks: {
          precision: 0,
          color: '#0B192C',
          font: { size: 11 },
        },
        title: {
          display: true,
          text: 'Cumulative Total',
          color: '#0B192C',
          font: { size: 11, weight: 'bold' as const },
        },
      },
    },
  };

  // Bar Data for Content Records
  const barData = {
    labels: ['Announcements', 'Drafts', 'Notices', 'Active Scholars'],
    datasets: [
      {
        label: 'Portal Records',
        data: [
          publishedAnnouncements,
          draftAnnouncements,
          publishedNotices,
          activeCount,
        ],
        backgroundColor: ['#0B192C', '#94A3B8', '#C5A059', '#16A34A'],
        borderRadius: 6,
      },
    ],
  };

  // Doughnut Data for Account Status
  const doughnutData = {
    labels: ['Active Accounts', 'Inactive Accounts'],
    datasets: [
      {
        data: [activeCount, inactiveCount],
        backgroundColor: ['#0B192C', '#CBD5E1'],
        borderColor: ['#FFFFFF', '#FFFFFF'],
        borderWidth: 2,
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Primary Chart: Student Activity Growth Over Time */}
      <div className="hover-glow bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-[#1B3B31]">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#FAF9F5] dark:bg-[#071713] border border-[#C5A059]/30 rounded-md text-[#0B192C] dark:text-[#D4AF37]">
                <TrendingUp className="w-4 h-4 text-[#C5A059]" />
              </span>
              <h3 className="text-base font-semibold text-[#0B192C] dark:text-white">
                Student Activity Growth Over Time
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#9AB0A6] mt-1">
              Visualizing daily student interactions, portal engagement, and cumulative participation growth from Activity Logs
            </p>
          </div>

          {/* Metric Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#071713] p-1 rounded-lg self-start sm:self-auto text-xs border border-transparent dark:border-[#1B3B31]">
            <button
              type="button"
              onClick={() => setViewMetric('both')}
              className={`press-scale px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                viewMetric === 'both'
                  ? 'bg-white dark:bg-[#064E3B] text-[#0B192C] dark:text-[#D4AF37] shadow-xs'
                  : 'text-slate-600 dark:text-[#9AB0A6] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Dual View
            </button>
            <button
              type="button"
              onClick={() => setViewMetric('cumulative')}
              className={`press-scale px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                viewMetric === 'cumulative'
                  ? 'bg-white dark:bg-[#064E3B] text-[#0B192C] dark:text-[#D4AF37] shadow-xs'
                  : 'text-slate-600 dark:text-[#9AB0A6] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Cumulative
            </button>
            <button
              type="button"
              onClick={() => setViewMetric('daily')}
              className={`press-scale px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                viewMetric === 'daily'
                  ? 'bg-white dark:bg-[#064E3B] text-[#0B192C] dark:text-[#D4AF37] shadow-xs'
                  : 'text-slate-600 dark:text-[#9AB0A6] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Daily
            </button>
          </div>
        </div>

        {/* Growth Key Performance Counters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-3 border-b border-slate-100 dark:border-[#1B3B31] bg-[#FAF9F5]/60 dark:bg-[#071713] rounded-lg px-3 my-3">
          <div className="flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-[#0B192C] dark:text-[#D4AF37]" />
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#9AB0A6] font-medium">Cumulative Actions</p>
              <p className="text-base font-bold text-[#0B192C] dark:text-white font-mono-tabular">{totalStudentEvents}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-4 h-4 text-[#C5A059]" />
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#9AB0A6] font-medium">Peak Day Activity</p>
              <p className="text-base font-bold text-[#0B192C] dark:text-white font-mono-tabular">{peakDayEvents} <span className="text-xs font-normal text-slate-500 dark:text-[#9AB0A6]">actions</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <CalendarCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#9AB0A6] font-medium">Timeline Window</p>
              <p className="text-base font-bold text-[#0B192C] dark:text-white font-mono-tabular">{timelinePoints.length} <span className="text-xs font-normal text-slate-500 dark:text-[#9AB0A6]">days</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#9AB0A6] font-medium">Total Activity Logs</p>
              <p className="text-base font-bold text-[#0B192C] dark:text-white font-mono-tabular">{activityLogs.length}</p>
            </div>
          </div>
        </div>

        {/* Chart.js Line Canvas */}
        <div className="h-64 mt-2">
          <Line data={lineChartData} options={lineChartOptions} />
        </div>
      </div>

      {/* Secondary Distribution Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="hover-glow lg:col-span-2 bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-[#0B192C] dark:text-white">
                Union Content &amp; Scholar Distribution
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#9AB0A6]">
                Live breakdown of published academic communications and active student accounts
              </p>
            </div>
            <span className="text-xs font-mono-tabular text-slate-500 dark:text-[#9AB0A6]">
              Session 2026–2027
            </span>
          </div>
          <div className="h-56">
            <Bar
              data={barData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                  legend: { display: false },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: { precision: 0 },
                  },
                },
              }}
            />
          </div>
        </div>

        <div className="hover-glow bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl p-5 shadow-xs flex flex-col justify-between transition-colors">
          <div>
            <h3 className="text-base font-semibold text-[#0B192C] dark:text-white">
              Student Account Status
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#9AB0A6] mb-3">
              Active vs. deactivated student union credentials
            </p>
          </div>
          <div className="h-44 flex items-center justify-center">
            <Doughnut
              data={doughnutData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 11 } },
                  },
                },
              }}
            />
          </div>
          <div className="pt-3 border-t border-slate-100 dark:border-[#1B3B31] flex items-center justify-between text-xs text-slate-600 dark:text-[#9AB0A6] font-mono-tabular">
            <span>Active: {activeCount}</span>
            <span>·</span>
            <span>Inactive: {inactiveCount}</span>
            <span>·</span>
            <span>Total: {students.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

