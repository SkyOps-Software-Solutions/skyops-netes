import React from 'react';
import { Cloud, Globe, Cpu, Server, MapPin, Layers, Box } from 'lucide-react';
import { CloudProvider, normalizeCloudProvider, discoverNodeCloudMetadata } from '../../utils/cloudMetadata';
import { KubernetesResource, Cluster } from '../../types/index';

interface CloudProviderBadgeProps {
  provider?: string | CloudProvider;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  showIcon?: boolean;
}

export const CloudProviderBadge: React.FC<CloudProviderBadgeProps> = ({
  provider,
  size = 'xs',
  className = '',
  showIcon = true
}) => {
  const normalized = normalizeCloudProvider(typeof provider === 'string' ? provider : provider);

  const sizeClasses = {
    xs: 'text-[10px] px-2 py-0.5 gap-1',
    sm: 'text-xs px-2.5 py-1 gap-1.5',
    md: 'text-sm px-3 py-1.5 gap-2'
  }[size];

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4'
  }[size];

  const providerStyles: Record<CloudProvider, { bg: string; text: string; border: string; label: string }> = {
    AWS: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      label: 'AWS'
    },
    GCP: {
      bg: 'bg-blue-500/10',
      text: 'text-blue-400',
      border: 'border-blue-500/30',
      label: 'GCP'
    },
    Azure: {
      bg: 'bg-sky-500/10',
      text: 'text-sky-400',
      border: 'border-sky-500/30',
      label: 'Azure'
    },
    'Self-hosted': {
      bg: 'bg-purple-500/10',
      text: 'text-purple-400',
      border: 'border-purple-500/30',
      label: 'Self-hosted'
    },
    Hybrid: {
      bg: 'bg-indigo-500/10',
      text: 'text-indigo-400',
      border: 'border-indigo-500/30',
      label: 'Hybrid Cloud'
    },
    Other: {
      bg: 'bg-teal-500/10',
      text: 'text-teal-400',
      border: 'border-teal-500/30',
      label: 'Cloud / Baremetal'
    },
    Unknown: {
      bg: 'bg-zinc-800/60',
      text: 'text-zinc-400',
      border: 'border-zinc-700/60',
      label: 'Standard K8s'
    }
  };

  const style = providerStyles[normalized] || providerStyles.Unknown;

  return (
    <span
      className={`inline-flex items-center font-mono font-medium rounded border ${style.bg} ${style.text} ${style.border} ${sizeClasses} ${className}`}
      title={`Cloud Provider: ${style.label}`}
    >
      {showIcon && <Cloud className={iconSizes} />}
      <span>{style.label}</span>
    </span>
  );
};

interface RegionBadgeProps {
  region?: string;
  zone?: string;
  zones?: string[];
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const RegionBadge: React.FC<RegionBadgeProps> = ({
  region,
  zone,
  zones,
  size = 'xs',
  className = ''
}) => {
  if (!region && !zone && (!zones || zones.length === 0)) {
    return (
      <span className="text-zinc-500 font-mono text-[10px]">
        Global / Unspecified
      </span>
    );
  }

  const sizeClasses = {
    xs: 'text-[10px] px-2 py-0.5 gap-1',
    sm: 'text-xs px-2.5 py-1 gap-1.5',
    md: 'text-sm px-3 py-1.5 gap-2'
  }[size];

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4'
  }[size];

  const displayRegion = region || (zones && zones[0]?.replace(/[a-z]$/, '')) || 'default';
  const displayZones = zones && zones.length > 0 ? zones.join(', ') : zone;

  return (
    <span
      className={`inline-flex items-center font-mono rounded border bg-sky-950/40 text-sky-300 border-sky-800/40 ${sizeClasses} ${className}`}
      title={`Region: ${displayRegion}${displayZones ? ` (Zones: ${displayZones})` : ''}`}
    >
      <Globe className={`${iconSizes} text-sky-400`} />
      <span>{displayRegion}</span>
      {displayZones && (
        <span className="text-zinc-500 text-[9px] font-normal">
          ({displayZones})
        </span>
      )}
    </span>
  );
};

interface InstanceTypeBadgeProps {
  instanceType?: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const InstanceTypeBadge: React.FC<InstanceTypeBadgeProps> = ({
  instanceType,
  size = 'xs',
  className = ''
}) => {
  if (!instanceType || instanceType === 'Unknown') {
    return <span className="text-zinc-500 font-mono text-[10px]">—</span>;
  }

  const sizeClasses = {
    xs: 'text-[10px] px-2 py-0.5 gap-1',
    sm: 'text-xs px-2.5 py-1 gap-1.5',
    md: 'text-sm px-3 py-1.5 gap-2'
  }[size];

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4'
  }[size];

  return (
    <span
      className={`inline-flex items-center font-mono rounded border bg-emerald-950/30 text-emerald-300 border-emerald-800/40 ${sizeClasses} ${className}`}
      title={`Machine / Instance Type: ${instanceType}`}
    >
      <Cpu className={`${iconSizes} text-emerald-400`} />
      <span>{instanceType}</span>
    </span>
  );
};

interface NodeInfrastructureBadgesProps {
  node?: KubernetesResource;
  cluster?: Cluster;
  provider?: string | CloudProvider;
  region?: string;
  zone?: string;
  instanceType?: string;
  size?: 'xs' | 'sm';
}

export const NodeInfrastructureBadges: React.FC<NodeInfrastructureBadgesProps> = ({
  node,
  cluster,
  provider,
  region,
  zone,
  instanceType,
  size = 'xs'
}) => {
  const meta = node ? discoverNodeCloudMetadata(node) : null;
  const effectiveProvider = provider || (meta && meta.provider !== 'Unknown' ? meta.provider : (cluster?.provider || 'Unknown'));
  const effectiveRegion = region || (meta && meta.region !== 'Unknown' ? meta.region : undefined);
  const effectiveZone = zone || (meta && meta.zone !== 'Unknown' ? meta.zone : undefined);
  const effectiveInstanceType = instanceType || (meta && meta.instanceType !== 'Unknown' ? meta.instanceType : undefined);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {effectiveProvider && effectiveProvider !== 'Unknown' && (
        <CloudProviderBadge provider={effectiveProvider} size={size} />
      )}
      {effectiveRegion && (
        <RegionBadge region={effectiveRegion} zone={effectiveZone} size={size} />
      )}
      {effectiveInstanceType && (
        <InstanceTypeBadge instanceType={effectiveInstanceType} size={size} />
      )}
    </div>
  );
};

interface ClusterInfrastructureBadgesProps {
  provider?: string;
  region?: string;
  regions?: string[];
  zones?: string[];
  instanceTypes?: string[];
  size?: 'xs' | 'sm';
}

export const ClusterInfrastructureBadges: React.FC<ClusterInfrastructureBadgesProps> = ({
  provider,
  region,
  regions,
  zones,
  instanceTypes,
  size = 'xs'
}) => {
  const effectiveRegion = region || (regions && regions.length > 0 ? regions[0] : undefined);

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {provider && <CloudProviderBadge provider={provider} size={size} />}
      {effectiveRegion && (
        <RegionBadge
          region={effectiveRegion}
          zones={zones && zones.length > 0 ? zones : undefined}
          size={size}
        />
      )}
      {instanceTypes && instanceTypes.length > 0 && (
        <span
          className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded border bg-zinc-900 border-zinc-800 text-zinc-300"
          title={`Node Instance Types: ${instanceTypes.join(', ')}`}
        >
          <Server className="w-3 h-3 text-zinc-400" />
          <span>{instanceTypes.length === 1 ? instanceTypes[0] : `${instanceTypes.length} machine types`}</span>
        </span>
      )}
    </div>
  );
};
