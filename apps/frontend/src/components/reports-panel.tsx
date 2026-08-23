'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface ReportsPanelProps {
  workspaceId: string;
}

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  padding: '8px 12px',
};

export function ReportsPanel({ workspaceId }: ReportsPanelProps) {
  const t = useTranslations('dashboard');
  // I9 报表交互：时间范围选择器（7/30/90 天）透传 overview.days
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ['reports-overview', workspaceId, days],
    queryFn: () => reportsApi.overview(workspaceId!, days).then((r) => r.data),
    enabled: !!workspaceId,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{t('reportTrendRange')}</span>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={
                days === d
                  ? 'rounded-md border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary'
                  : 'rounded-md border border-input px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent'
              }
            >
              {d}D
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
      {/* Sprint 进度 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('reportSprints')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <Skeleton className="h-24 w-full" />
          ) : data.sprintProgress.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">{t('reportEmpty')}</p>
          ) : (
            <div className="space-y-2">
              {data.sprintProgress.map((sp: any) => (
                <div key={sp.id} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate">{sp.name}</span>
                    <span className="text-muted-foreground">{sp.percent}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${sp.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 测试通过率趋势（Recharts 折线） */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('reportTestTrend')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={data.testTrend} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="pass" stroke="#22c55e" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="fail" stroke="#ef4444" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 缺陷趋势（Recharts 折线） */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('reportDefectTrend')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={data.defectTrend} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="created" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="closed" stroke="#10b981" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
