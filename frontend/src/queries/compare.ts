'use client';

import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CompareInput, CompareResponseDto } from '@/types/shared';

export function useCompareModels() {
  return useMutation({
    mutationFn: (input: CompareInput) =>
      api<CompareResponseDto>('/compare', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}
