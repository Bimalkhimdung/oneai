'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Cloud,
  Monitor,
  Cpu,
  HardDrive,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Zap,
  Lock,
  RefreshCw,
  Download,
} from 'lucide-react';

type ProviderType = 'local' | 'cloud' | null;
type LocalProvider = 'OLLAMA' | 'LLAMA_CPP' | 'VLLM' | 'LM_STUDIO' | null;

interface SystemSpecs {
  cpu: {
    brand: string;
    physicalCores: number;
    logicalCores: number;
    percent: number;
  };
  ram: {
    totalGb: number;
    usedGb: number;
    freeGb: number;
    percent: number;
  };
  storage: {
    totalGb: number;
    usedGb: number;
    freeGb: number;
    percent: number;
  };
}

interface ProviderInstallInfo {
  status: 'idle' | 'installing' | 'completed' | 'installed' | 'failed';
  logs: string[];
  progress: number;
}

interface InstallationsResponse {
  [key: string]: ProviderInstallInfo;
}

// ── Custom inline SVG icons sourced from /public/logo/onboarding/ ──────────

const OllamaIcon = ({ className }: { className?: string }) => (
  <svg
    className={cn("h-5 w-5", className)}
    viewBox="0 0 17 25"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M4.40517 0.102088C4.62117 0.198678 4.81617 0.357766 4.99317 0.56799C5.28817 0.915712 5.53718 1.41342 5.72718 2.00318C5.91818 2.59635 6.04218 3.25316 6.08918 3.91224C6.71878 3.5075 7.41754 3.26103 8.13818 3.18953L8.18918 3.18498C9.05919 3.10544 9.91919 3.28384 10.6692 3.72361C10.7702 3.78384 10.8692 3.84861 10.9662 3.91679C11.0162 3.27021 11.1382 2.62817 11.3262 2.04863C11.5162 1.45773 11.7652 0.961166 12.0592 0.612308C12.2235 0.410338 12.4245 0.251368 12.6482 0.146406C12.9052 0.032771 13.1782 0.0123167 13.4442 0.098679C13.8452 0.228223 14.1892 0.516855 14.4602 0.936167C14.7082 1.3191 14.8942 1.81 15.0212 2.39863C15.2512 3.45998 15.2912 4.85655 15.1362 6.54061L15.1892 6.58607L15.2152 6.60766C15.9722 7.26219 16.4992 8.19513 16.7782 9.27807C17.2133 10.9678 16.9943 12.8632 16.2442 13.9235L16.2262 13.9473L16.2282 13.9507C16.6453 14.8166 16.8983 15.7314 16.9523 16.678L16.9543 16.7121C17.0183 17.9223 16.7542 19.1404 16.1402 20.337L16.1332 20.3484L16.1432 20.3756C16.6152 21.6904 16.7632 23.0142 16.5812 24.3369L16.5752 24.3813C16.547 24.5744 16.4525 24.7472 16.3125 24.8612C16.1725 24.9753 15.9983 25.0219 15.8282 24.9903C15.744 24.9753 15.6632 24.9417 15.5904 24.8912C15.5177 24.8408 15.4544 24.7744 15.4042 24.696C15.3541 24.6178 15.318 24.529 15.2981 24.4347C15.2782 24.3406 15.2748 24.2428 15.2882 24.1472C15.4552 22.9733 15.2982 21.7961 14.8082 20.5984C14.7625 20.4871 14.7422 20.3645 14.7492 20.242C14.7562 20.1194 14.7902 20.0009 14.8482 19.8972L14.8522 19.8904C15.4562 18.8404 15.7062 17.8109 15.6522 16.7996C15.6062 15.9143 15.3272 15.045 14.8522 14.2166C14.7598 14.0556 14.7269 13.8597 14.7606 13.6713C14.7943 13.4829 14.8918 13.3171 15.0322 13.2098L15.0412 13.203C15.2842 13.0223 15.5082 12.561 15.6212 11.9303C15.7459 11.1846 15.7133 10.4159 15.5262 9.68716C15.3212 8.89171 14.9462 8.22809 14.4212 7.77468C13.8262 7.25878 13.0382 7.00992 12.0412 7.08151C11.9108 7.09115 11.7809 7.05613 11.6682 6.98097C11.5556 6.90581 11.4653 6.79399 11.4092 6.65993C11.0952 5.90426 10.6372 5.36336 10.0662 5.02814C9.51799 4.71723 8.90425 4.58657 8.29418 4.65087C7.04918 4.76337 5.95118 5.56108 5.62418 6.56675C5.57792 6.70829 5.4947 6.8304 5.38568 6.91672C5.27666 7.00301 5.14703 7.04942 5.01417 7.0497C3.94717 7.05197 3.12117 7.33606 2.51717 7.84855C1.99517 8.29172 1.63916 8.91103 1.45116 9.65307C1.28104 10.3515 1.25774 11.0857 1.38316 11.7962C1.49516 12.4303 1.71416 12.9553 1.96517 13.2382L1.97317 13.2462C2.18517 13.4814 2.23017 13.8485 2.08217 14.1382C1.72216 14.845 1.45316 15.8984 1.40916 16.9109C1.35916 18.0677 1.59516 19.0722 2.12817 19.7927L2.14417 19.8143C2.22461 19.9208 2.27633 20.0514 2.29319 20.1905C2.31003 20.3295 2.29127 20.4711 2.23917 20.5984C1.66316 22.0029 1.48616 23.1574 1.67716 24.0665C1.71148 24.2556 1.67954 24.4524 1.58812 24.6149C1.4967 24.7776 1.35302 24.8933 1.18766 24.9374C1.0223 24.9817 0.848322 24.9506 0.702741 24.8512C0.557141 24.7517 0.451463 24.5917 0.408163 24.4051C0.165162 23.2483 0.330162 21.9233 0.881162 20.4302L0.895162 20.3904L0.887162 20.3768C0.616341 19.9222 0.414243 19.4195 0.289162 18.8893L0.284162 18.8677C0.132362 18.2062 0.0726416 17.5218 0.107162 16.8393C0.151162 15.8052 0.385163 14.7462 0.729162 13.8962L0.741162 13.8666L0.739162 13.8644C0.446163 13.3894 0.229162 12.7814 0.109162 12.1087L0.104162 12.0814C-0.0611788 11.1431 -0.0293187 10.1737 0.197162 9.25194C0.459163 8.21218 0.974162 7.31901 1.73316 6.67356C1.79316 6.62243 1.85616 6.57129 1.91916 6.52357C1.76016 4.827 1.80016 3.42134 2.03117 2.35317C2.15817 1.76455 2.34517 1.27365 2.59317 0.890713C2.86317 0.472537 3.20717 0.183905 3.60817 0.0532252C3.87417 -0.0331371 4.14817 -0.0126829 4.40517 0.102088ZM8.52118 10.4315C9.45719 10.4315 10.3212 10.7871 10.9672 11.403C11.5972 12.0019 11.9722 12.8064 11.9722 13.6076C11.9722 14.6166 11.5662 15.403 10.8392 15.9052C10.2192 16.3314 9.38819 16.5382 8.43618 16.5382C7.42718 16.5382 6.56518 16.2439 5.94318 15.7041C5.32618 15.17 4.98017 14.42 4.98017 13.6076C4.98017 12.8042 5.37818 11.9973 6.03618 11.3962C6.70418 10.786 7.58618 10.4315 8.52118 10.4315ZM8.52118 11.4496C7.82742 11.4428 7.15204 11.7031 6.60518 12.1883C6.14418 12.6087 5.88318 13.1371 5.88318 13.6087C5.88318 14.095 6.09318 14.5507 6.49318 14.8973C6.94818 15.2916 7.61718 15.52 8.43618 15.52C9.23519 15.52 9.90919 15.353 10.3682 15.0359C10.8312 14.7178 11.0682 14.2564 11.0682 13.6076C11.0682 13.1269 10.8222 12.5962 10.3852 12.1803C9.90119 11.7201 9.24519 11.4496 8.52118 11.4496ZM9.18319 12.8246L9.18719 12.8292C9.30719 13.0007 9.28219 13.2496 9.13119 13.386L8.83919 13.6473V14.1541C8.83865 14.267 8.79877 14.375 8.72829 14.4544C8.6578 14.5339 8.56246 14.5783 8.46318 14.578C8.3639 14.5783 8.26856 14.5339 8.19808 14.4544C8.12758 14.375 8.0877 14.267 8.08718 14.1541V13.6314L7.81618 13.3837C7.78042 13.3511 7.7507 13.3109 7.72872 13.2652C7.70674 13.2195 7.69294 13.1694 7.6881 13.1176C7.68326 13.0658 7.6875 13.0135 7.70056 12.9636C7.71362 12.9137 7.73524 12.8672 7.76418 12.8269C7.8232 12.7452 7.9082 12.6934 8.0007 12.6825C8.09318 12.6717 8.18572 12.7027 8.25818 12.7689L8.47318 12.9644L8.69318 12.7667C8.76538 12.7018 8.85702 12.6716 8.94854 12.6825C9.04009 12.6933 9.12427 12.7443 9.18319 12.8246ZM4.14317 10.644C4.62117 10.644 5.01017 11.0871 5.01017 11.6337C5.01043 11.8957 4.91917 12.1471 4.75641 12.3327C4.59365 12.5183 4.37273 12.6229 4.14217 12.6235C3.91195 12.6226 3.69143 12.518 3.52893 12.3327C3.36641 12.1474 3.27517 11.8965 3.27517 11.6349C3.27463 11.3729 3.36565 11.1213 3.52821 10.9355C3.69079 10.7497 3.91261 10.6449 4.14317 10.644ZM12.8492 10.644C13.3292 10.644 13.7172 11.0871 13.7172 11.6337C13.7175 11.8957 13.6262 12.1471 13.4634 12.3327C13.3007 12.5183 13.0798 12.6229 12.8492 12.6235C12.619 12.6226 12.3985 12.518 12.236 12.3327C12.0734 12.1474 11.9822 11.8965 11.9822 11.6349C11.9817 11.3729 12.0727 11.1213 12.2352 10.9355C12.3978 10.7497 12.6186 10.6449 12.8492 10.644ZM3.94017 1.47705L3.93717 1.47932C3.82131 1.53657 3.72239 1.63046 3.65217 1.74977L3.64717 1.75659C3.50917 1.97136 3.38917 2.28727 3.29917 2.70203C3.12917 3.48839 3.08317 4.55541 3.17517 5.86335C3.60517 5.7179 4.07417 5.62699 4.57917 5.59404L4.58917 5.5929L4.60817 5.55426C4.65417 5.46108 4.70317 5.37131 4.75617 5.28268C4.87917 4.40655 4.77817 3.35998 4.50317 2.50545C4.36917 2.09182 4.20617 1.76682 4.05017 1.5816C4.01797 1.5431 3.98207 1.5088 3.94317 1.47932L3.94017 1.47705ZM13.1142 1.52251L13.1122 1.52364C13.0733 1.55312 13.0374 1.58741 13.0052 1.62591C12.8492 1.81114 12.6852 2.13727 12.5522 2.5509C12.2622 3.45316 12.1652 4.56905 12.3222 5.47358L12.3802 5.58381L12.3882 5.59972H12.4182C12.9145 5.59988 13.4082 5.68101 13.8842 5.84062C13.9702 4.56337 13.9222 3.51907 13.7562 2.74749C13.6662 2.33272 13.5462 2.01682 13.4072 1.80205L13.4032 1.79523C13.3331 1.67548 13.2342 1.58121 13.1182 1.52364L13.1142 1.52251Z"
      fill="currentColor"
    />
  </svg>
);

const LlamaCppIcon = ({ className }: { className?: string }) => (
  <svg
    className={cn('h-5 w-5', className)}
    viewBox="0 0 24 24"
    fill="currentColor"
    fillRule="evenodd"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M15.855 17.122c-2.092.924-4.358.545-5.23.24 0 .21-.01.857-.048 1.78-.038.924-.332 1.507-.475 1.684.016.577.029 1.837-.047 2.26a1.93 1.93 0 01-.476.914H8.295c.114-.577.555-.946.761-1.058.114-1.193-.11-2.229-.238-2.597-.126.449-.437 1.49-.665 2.068a6.418 6.418 0 01-.713 1.299h-.951c-.048-.578.27-.77.475-.77.095-.177.323-.731.476-1.54.152-.807-.064-2.324-.19-2.981v-2.068c-1.522-.818-2.092-1.636-2.473-2.55-.304-.73-.222-1.843-.142-2.308-.096-.176-.373-.625-.476-1.25-.142-.866-.063-1.491 0-1.828-.095-.096-.285-.587-.285-1.78 0-1.192.349-1.811.523-1.972v-.529c-.666-.048-1.331-.336-1.712-.721-.38-.385-.095-.962.143-1.154.238-.193.475-.049.808-.145.333-.096.618-.192.76-.48C4.512 1.403 4.287.448 4.16 0c.57.077.935.577 1.046.818V0c.713.337 1.997 1.154 2.425 2.934.342 1.424.586 4.409.665 5.723 1.823.016 4.137-.26 6.229.193 1.901.412 2.757 1.25 3.755 1.25.999 0 1.57-.577 2.282-.096.714.481 1.094 1.828.999 2.838-.076.808-.697 1.074-.998 1.106-.38 1.27 0 2.485.237 2.934v1.827c.111.16.333.655.333 1.347 0 .693-.222 1.154-.333 1.299.19 1.077-.08 2.18-.238 2.597h-1.283c.152-.385.412-.481.523-.481.228-1.193.063-2.293-.048-2.693-.722-.424-1.188-1.17-1.331-1.491.016.272-.029 1.029-.333 1.875-.304.847-.76 1.347-.95 1.491v1.01h-1.284c0-.615.348-.737.523-.721.222-.4.76-1.01.76-2.212 0-1.015-.713-1.492-1.236-2.405-.248-.434-.127-.978-.047-1.203z" />
  </svg>
);

const VllmIcon = ({ className }: { className?: string }) => (
  <svg
    className={cn('h-5 w-5', className)}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M0 4.973h9.324V23L0 4.973z" fill="#FDB515" />
    <path d="M13.986 4.351L22.378 0l-6.216 23H9.324l4.662-18.649z" fill="#30A2FF" />
  </svg>
);

const LmStudioIcon = ({ className }: { className?: string }) => (
  <svg
    className={cn('h-5 w-5', className)}
    viewBox="0 0 24 24"
    fill="currentColor"
    fillRule="evenodd"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Faded background stripes */}
    <path
      d="M2.84 2a1.273 1.273 0 100 2.547h14.107a1.273 1.273 0 100-2.547H2.84zM7.935 5.33a1.273 1.273 0 000 2.548H22.04a1.274 1.274 0 000-2.547H7.935zM3.624 9.935c0-.704.57-1.274 1.274-1.274h14.106a1.274 1.274 0 010 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM1.273 12.188a1.273 1.273 0 100 2.547H15.38a1.274 1.274 0 000-2.547H1.273zM3.624 16.792c0-.704.57-1.274 1.274-1.274h14.106a1.273 1.273 0 110 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM13.029 18.849a1.273 1.273 0 100 2.547h9.698a1.273 1.273 0 100-2.547h-9.698z"
      fillOpacity="0.3"
    />
    {/* Foreground stripes */}
    <path d="M2.84 2a1.273 1.273 0 100 2.547h10.287a1.274 1.274 0 000-2.547H2.84zM7.935 5.33a1.273 1.273 0 000 2.548H18.22a1.274 1.274 0 000-2.547H7.935zM3.624 9.935c0-.704.57-1.274 1.274-1.274h10.286a1.273 1.273 0 010 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM1.273 12.188a1.273 1.273 0 100 2.547H11.56a1.274 1.274 0 000-2.547H1.273zM3.624 16.792c0-.704.57-1.274 1.274-1.274h10.286a1.273 1.273 0 110 2.547H4.898c-.703 0-1.274-.57-1.274-1.273zM13.029 18.849a1.273 1.273 0 100 2.547h5.78a1.273 1.273 0 100-2.547h-5.78z" />
  </svg>
);

const LOCAL_PROVIDERS = [
  {
    id: 'OLLAMA' as LocalProvider,
    name: 'Ollama',
    icon: OllamaIcon,
    badge: 'Recommended',
    badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    description: 'The easiest way to run AI models locally. Simple setup with a beautiful REST API.',
    features: ['Mac, Linux, Windows', 'Metal / CUDA acceleration', 'One-click model pulls'],
    defaultPort: 11434,
    color: 'from-emerald-500/10 to-teal-500/5 border-emerald-500/20',
    activeColor: 'border-emerald-400/60 from-emerald-500/20 to-teal-500/10 bg-emerald-500/5',
    iconColor: 'text-emerald-400',
  },
  {
    id: 'LLAMA_CPP' as LocalProvider,
    name: 'Llama.cpp',
    icon: LlamaCppIcon,
    badge: 'Lightweight',
    badgeColor: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    description: 'Raw inference engine in C++. Run GGUF models directly with maximum performance.',
    features: ['Minimal dependencies', 'GGUF model support', 'AVX / Metal / CUDA'],
    defaultPort: 8080,
    color: 'from-violet-500/10 to-purple-500/5 border-violet-500/20',
    activeColor: 'border-violet-400/60 from-violet-500/20 to-purple-500/10 bg-violet-500/5',
    iconColor: 'text-violet-400',
  },
  {
    id: 'VLLM' as LocalProvider,
    name: 'vLLM',
    icon: VllmIcon,
    badge: 'High Throughput',
    badgeColor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    description: 'Production-grade LLM server. Best for GPU servers with high request throughput.',
    features: ['Multi-GPU support', 'OpenAI-compatible API', 'PagedAttention'],
    defaultPort: 8000,
    color: 'from-blue-500/10 to-cyan-500/5 border-blue-500/20',
    activeColor: 'border-blue-400/60 from-blue-500/20 to-cyan-500/10 bg-blue-500/5',
    iconColor: 'text-blue-400',
  },
  {
    id: 'LM_STUDIO' as LocalProvider,
    name: 'LM Studio',
    icon: LmStudioIcon,
    badge: 'GUI + API',
    badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    description: 'Desktop app with a built-in model server. Great if you prefer a graphical interface.',
    features: ['Desktop GUI', 'Model browser', 'OpenAI-compatible'],
    defaultPort: 1234,
    color: 'from-amber-500/10 to-orange-500/5 border-amber-500/20',
    activeColor: 'border-amber-400/60 from-amber-500/20 to-orange-500/10 bg-amber-500/5',
    iconColor: 'text-amber-400',
  },
];

const CLOUD_OPTIONS = [
  { name: 'OpenAI', icon: Sparkles, desc: 'GPT-4o, o1 and more via API key.' },
  { name: 'Anthropic', icon: Zap, desc: 'Claude 3.5 Sonnet via API key.' },
  { name: 'Custom OpenAI Compat', icon: Lock, desc: 'Any provider with an OpenAI-compatible endpoint.' },
];

function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${value || 0}%` }}
      />
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [providerType, setProviderType] = useState<ProviderType>(null);
  const [selectedLocal, setSelectedLocal] = useState<LocalProvider>(null);
  
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);
  const [loadingSpecs, setLoadingSpecs] = useState(false);

  const [installations, setInstallations] = useState<InstallationsResponse | null>(null);
  const [hasSetDefault, setHasSetDefault] = useState(false);

  const revealRef = useRef<HTMLDivElement | null>(null);

  // Poll system specs
  useEffect(() => {
    if (providerType === 'local' && !specs) {
      setLoadingSpecs(true);
      api<SystemSpecs>('/settings/system-specs')
        .then((data) => {
          setSpecs(data);
        })
        .catch((err) => {
          console.error('Failed to load system specs', err);
        })
        .finally(() => {
          setLoadingSpecs(false);
        });
    }
  }, [providerType, specs]);

  // Poll installations status
  useEffect(() => {
    if (providerType !== 'local') return;

    let interval: NodeJS.Timeout;
    async function fetchStatuses() {
      try {
        const data = await api<InstallationsResponse>('/settings/installations');
        setInstallations(data);
        
        // Select pre-installed local engine by default if we haven't checked yet
        if (!selectedLocal && !hasSetDefault) {
          const installedProvider = LOCAL_PROVIDERS.find(
            (p) => data[p.id!]?.status === 'installed' || data[p.id!]?.status === 'completed'
          );
          if (installedProvider) {
            setSelectedLocal(installedProvider.id);
            setHasSetDefault(true);
          }
        }
      } catch (err) {
        console.error('Failed to fetch installation statuses', err);
      }
    }

    fetchStatuses();
    interval = setInterval(fetchStatuses, 2000);

    return () => clearInterval(interval);
  }, [providerType, selectedLocal, hasSetDefault]);

  const selectProviderType = (type: ProviderType) => {
    setProviderType(type);
    setSelectedLocal(null);
    setTimeout(() => {
      revealRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  async function handleInstall(providerId: string) {
    try {
      toast.info(`Starting installation of ${providerId}...`);
      await api('/settings/install', {
        method: 'POST',
        body: JSON.stringify({ provider: providerId }),
      });
    } catch (err: any) {
      toast.error(err?.message || `Failed to trigger installation for ${providerId}`);
    }
  }

  function markDoneAndContinue() {
    if (user) {
      localStorage.setItem(`onboarding_done_${user.id}`, '1');
    }
    router.replace('/dashboard');
  }

  const activeProviderData = LOCAL_PROVIDERS.find((p) => p.id === selectedLocal);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary mb-6 animate-in fade-in duration-500">
          <Sparkles className="h-3.5 w-3.5" />
          Welcome to Local AI Hub
        </div>
        <h2 className="text-3xl font-bold text-white tracking-tight mb-3 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-75 fill-mode-both">
          Configure Your First Provider
        </h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-both">
          Choose between local execution or cloud hosting to begin powered inference.
        </p>
      </div>

      {/* Main Options Grid */}
      <div className="grid md:grid-cols-2 gap-6 w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both">
        {/* Local Option Card */}
        <div
          onClick={() => selectProviderType('local')}
          className={cn(
            'group relative flex flex-col gap-4 rounded-2xl border bg-gradient-to-br p-6 text-left transition-all duration-300 cursor-pointer select-none',
            providerType === 'local'
              ? 'border-primary/60 from-primary/10 to-primary/5 shadow-lg shadow-primary/5'
              : 'from-primary/5 to-primary/0 border-border/40 hover:border-primary/30 hover:from-primary/10',
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Monitor className="h-6 w-6" />
            </div>
            {providerType === 'local' && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-semibold text-foreground text-lg">Local Model</span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                Free & Private
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Run models entirely on your own machine. No API costs, full data privacy.
            </p>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {['100% private — data never leaves your machine', 'No per-token cost', 'Works offline'].map(f => (
              <li key={f} className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Cloud Option Card */}
        <div
          onClick={() => selectProviderType('cloud')}
          className={cn(
            'group relative flex flex-col gap-4 rounded-2xl border bg-gradient-to-br p-6 text-left transition-all duration-300 cursor-pointer select-none',
            providerType === 'cloud'
              ? 'border-sky-500/60 from-sky-500/10 to-sky-500/5 shadow-lg shadow-sky-500/5'
              : 'from-sky-500/5 to-blue-500/0 border-border/40 hover:border-sky-500/30 hover:from-sky-500/10',
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Cloud className="h-6 w-6" />
            </div>
            {providerType === 'cloud' && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-semibold text-foreground text-lg">Cloud Provider</span>
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400">
                Coming Soon
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Connect to OpenAI, Anthropic, or any OpenAI-compatible hosted API endpoint.
            </p>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {['No hardware required', 'Access frontier models', 'Scalable on demand'].map(f => (
              <li key={f} className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Dynamic Reveal Section based on chosen provider type */}
      <div ref={revealRef} className="w-full max-w-4xl mt-8 transition-all duration-300 scroll-mt-6">
        {providerType === 'local' && (
          <div className="space-y-6">
            {/* System Specs Widget */}
            <div className="border-t border-border/40 pt-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75 fill-mode-both">
              <h3 className="text-lg font-medium text-foreground mb-1">Your Device Hardware Specifications</h3>
              <p className="text-xs text-muted-foreground mb-4">Your current system hardware profile, used to evaluate model capabilities.</p>
              
              {loadingSpecs ? (
                <div className="flex items-center justify-center p-6 bg-white/[0.02] rounded-2xl border border-border/20 text-xs text-muted-foreground animate-pulse">
                  <Cpu className="h-4 w-4 animate-spin mr-2" />
                  Querying local CPU, RAM and Storage specs...
                </div>
              ) : specs ? (
                <div className="grid md:grid-cols-3 gap-4 p-5 rounded-2xl bg-white/[0.02] border border-border/20 backdrop-blur-sm mb-6">
                  {/* CPU */}
                  <div className="flex gap-3 items-center animate-in fade-in slide-in-from-bottom-3 duration-500 delay-100 fill-mode-both">
                    <div className="p-2 bg-primary/10 text-primary rounded-xl">
                      <Cpu className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Processor</p>
                      <p className="text-xs font-semibold text-foreground truncate" title={specs.cpu.brand}>{specs.cpu.brand}</p>
                      <p className="text-[10px] text-muted-foreground">{specs.cpu.physicalCores} Cores ({specs.cpu.logicalCores} threads)</p>
                    </div>
                  </div>
                  
                  {/* RAM */}
                  <div className="flex gap-3 items-center animate-in fade-in slide-in-from-bottom-3 duration-500 delay-200 fill-mode-both">
                    <div className="p-2 bg-primary/10 text-primary rounded-xl">
                      <Monitor className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Memory (RAM)</p>
                      <p className="text-xs font-semibold text-foreground">{specs.ram.totalGb} GB Total</p>
                      <p className="text-[10px] text-muted-foreground">{specs.ram.usedGb} GB used ({specs.ram.percent}%)</p>
                    </div>
                  </div>

                  {/* Disk */}
                  <div className="flex gap-3 items-center animate-in fade-in slide-in-from-bottom-3 duration-500 delay-300 fill-mode-both">
                    <div className="p-2 bg-primary/10 text-primary rounded-xl">
                      <HardDrive className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Storage</p>
                      <p className="text-xs font-semibold text-foreground">{specs.storage.freeGb} GB free</p>
                      <p className="text-[10px] text-muted-foreground">of {specs.storage.totalGb} GB total</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-border/40 pt-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both">
              <h3 className="text-lg font-medium text-foreground mb-1">Select Local Inference Engine</h3>
              <p className="text-xs text-muted-foreground mb-4">Choose which backend engine runs on your local machine.</p>
              
              {/* Dynamic Reveal & Layout Swap */}
              {selectedLocal && activeProviderData ? (
                <div className="space-y-3">
                  {/* Repositioned on top of the selected engine box at the right side */}
                  <div className="flex justify-between items-center px-1 animate-in fade-in duration-300">
                    <span className="text-xs text-muted-foreground font-medium">Selected Engine</span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                      onClick={() => {
                        setSelectedLocal(null);
                        setTimeout(() => {
                          revealRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }}
                      disabled={installations?.[selectedLocal]?.status === 'installing'}
                    >
                      Select other engine →
                    </button>
                  </div>

                  <div className="flex flex-col md:flex-row gap-6 p-6 rounded-2xl bg-white/[0.02] border border-primary/30 items-center justify-between animate-in fade-in zoom-in-95 duration-300">
                    {/* Selected Model Card (pushed to near left margin) */}
                    <div className="flex gap-4 items-center w-full md:w-auto">
                      <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-card/60 border border-border/40', activeProviderData.iconColor)}>
                        {(() => {
                          const Icon = activeProviderData.icon;
                          return <Icon className="h-6 w-6" />;
                        })()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground text-base">{activeProviderData.name}</span>
                          <span className={cn('rounded-full border px-2 py-0.5 text-[9px] font-semibold', activeProviderData.badgeColor)}>
                            {activeProviderData.badge}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 max-w-sm truncate">{activeProviderData.description}</p>
                      </div>
                    </div>

                    {/* Installer controls revealed next to the card in the same row */}
                  <div className="flex flex-col sm:flex-row gap-4 items-center w-full md:w-auto justify-end">
                    {(() => {
                      const info = selectedLocal
                        ? installations?.[selectedLocal] ?? { status: 'idle', logs: [], progress: 0 }
                        : { status: 'idle', logs: [], progress: 0 };
                      const isInstalling = info.status === 'installing';
                      const isInstalled = info.status === 'installed' || info.status === 'completed';

                        return (
                          <div className="flex flex-col gap-2 w-full sm:w-auto">
                            {isInstalling && (
                              <div className="w-full sm:w-48 space-y-1 mb-1">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                  <span>Installing...</span>
                                  <span>{info.progress}%</span>
                                </div>
                                <Progress value={info.progress} className="h-1" />
                              </div>
                            )}

                            <div className="flex gap-2 justify-end items-center">
                              {isInstalled ? (
                                <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                                  <CheckCircle2 className="h-4 w-4" />
                                  Installed Successfully
                                </div>
                              ) : isInstalling ? (
                                <Button disabled size="sm" className="h-9 text-xs gap-1.5">
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                  Installing...
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  className="h-9 text-xs gap-1.5"
                                  onClick={() => handleInstall(activeProviderData.id!)}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  Install {activeProviderData.name}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ) : (
                /* Unselected State: Show 2-column Grid */
                <div className="grid sm:grid-cols-2 gap-4">
                  {LOCAL_PROVIDERS.map((p, index) => {
                    const Icon = p.icon;
                    // Stagger animation based on index
                    const animationDelay = `${(index + 1) * 75 + 100}ms`;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedLocal(p.id)}
                        style={{ animationDelay }}
                        className={cn(
                          'group relative flex flex-col gap-3 rounded-2xl border bg-gradient-to-br p-5 text-left transition-all duration-300',
                          'animate-in fade-in slide-in-from-bottom-4 fill-mode-both',
                          p.color,
                          'hover:border-primary/40 hover:from-primary/10',
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-card/50 border border-border/40', p.iconColor)}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', p.badgeColor)}>
                            {p.badge}
                          </span>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-foreground">{p.name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                        </div>

                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {p.features.map((f) => (
                            <li key={f} className="flex items-center gap-1.5">
                              <span className={cn('h-1 w-1 rounded-full', p.iconColor.replace('text-', 'bg-'))} />
                              {f}
                            </li>
                          ))}
                        </ul>

                        <p className="text-[11px] text-muted-foreground/60 font-mono">
                          Default port: {p.defaultPort}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {providerType === 'cloud' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300 border-t border-border/40 pt-6">
            <div className="rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm p-6 text-center space-y-4 max-w-xl mx-auto">
              <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <Cloud className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-base text-foreground">Cloud Integrations Coming Soon</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Connect OpenAI API, Anthropic, or any custom API gateway key. For immediate setup, select a local model.
              </p>
              <div className="grid grid-cols-3 gap-3 pt-2">
                {CLOUD_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <div key={opt.name} className="rounded-xl border border-border/30 bg-card/20 p-2.5 space-y-1 opacity-50">
                      <Icon className="h-4 w-4 text-muted-foreground mx-auto" />
                      <p className="text-[10px] font-medium text-center">{opt.name}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation Bar */}
      <div className="flex items-center justify-between w-full max-w-4xl mt-8 border-t border-border/20 pt-6">
        <div className="text-xs text-muted-foreground">
          {providerType ? (
            <span>Selected: <strong className="capitalize text-foreground font-medium">{providerType}</strong></span>
          ) : (
            <span>Please choose an option to start setup</span>
          )}
        </div>

        <div className="flex gap-3">
          <Button variant="ghost" size="sm" onClick={markDoneAndContinue} className="text-xs">
            Skip Setup
          </Button>
          <Button
            size="sm"
            disabled={!providerType || (providerType === 'local' && !selectedLocal)}
            onClick={markDoneAndContinue}
            className="gap-2 text-xs"
          >
            Continue to Dashboard
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
