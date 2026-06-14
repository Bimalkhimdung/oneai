'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Cpu, HardDrive, MemoryStick } from 'lucide-react';

interface SystemSpecs {
  cpu: { brand: string; percent: number; logicalCores: number; physicalCores: number };
  ram: { totalGb: number; usedGb: number; percent: number };
  storage: { totalGb: number; usedGb: number; percent: number };
}

export function SystemSpecsNav() {
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);

  useEffect(() => {
    const fetchSpecs = async () => {
      try {
        const data = await api<SystemSpecs>('/settings/system-specs');
        setSpecs(data);
      } catch (err) {
        console.error('Failed to fetch system specs:', err);
      }
    };

    fetchSpecs();
    const interval = setInterval(fetchSpecs, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!specs) return null;

  return (
    <div className="flex items-center gap-6 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <Cpu className="w-4 h-4 text-primary/70" />
        <span className="hidden sm:inline-block">
          {specs.cpu.brand} <span className="text-muted-foreground/70">({specs.cpu.logicalCores} Cores)</span>
        </span>
        <span className="font-mono">{specs.cpu.percent.toFixed(1)}%</span>
      </div>
      
      <div className="flex items-center gap-2">
        <MemoryStick className="w-4 h-4 text-primary/70" />
        <span className="font-mono">{specs.ram.usedGb} / {specs.ram.totalGb} GB</span>
      </div>
      
      <div className="flex items-center gap-2">
        <HardDrive className="w-4 h-4 text-primary/70" />
        <span className="font-mono">{specs.storage.usedGb} / {specs.storage.totalGb} GB</span>
      </div>
    </div>
  );
}
