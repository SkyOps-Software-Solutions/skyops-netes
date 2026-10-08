import React from 'react';
import { Cloud, Server, MapPin, Cpu, Layers, Globe } from 'lucide-react';
import {
  CloudProvider,
  getCloudProviderVisual,
  normalizeCloudProvider
} from '../../utils/cloudMetadata';

interface CloudProviderBadgeProps {
  provider?: string | CloudProvider;
  showIcon?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const CloudProviderBadge: React.FC<CloudProviderBadgeProps> = ({
  provider,
  showIcon = true,
  size = 'xs',
  className = ''
}) => {
  const visual = getCloudProviderVisual(provider);
  const sizeClasses =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px] gap-1'
      : size === 'sm'
      ? 'px-2 py-0.5 text-[11px] gap-1.5'
      : 'px-2.5 py-1 text-xs gap-2';

  const iconSize = size === 'xs' ? 'w-2.5 h-2.5' : size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={`inline-flex items-center rounded font-mono font-bold border shrink-0 ${visual.badgeClass} ${sizeClasses} ${className}`}
      title={`Cloud Provider: ${visual.label}`}
    >
      {showIcon && (
        visual.iconName === 'self-hosted' ? (
          <Server className={`${iconSize} shrink-0`} />
        ) : visual.iconName === 'hybrid' ? (
          <Layers className={`${iconSize} shrink-0`} />
        ) : (
          <Cloud className={`${iconSize} shrink-0`} />
        )
      )}
      <span className="truncate">{visual.shortLabel}</span>
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
  const displayRegion = region && region !== 'Unknown' ? region : null;
  const displayZone = zone && zone !== 'Unknown' ? zone : null;
  const zonesList = Array.isArray(zones) ? zones.filter((z) => z && z !== 'Unknown') : [];

  if (!displayRegion && !displayZone && zonesList.length === 0) {
    return null;
  }

  const sizeClasses =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px] gap-1'
      : size === 'sm'
      ? 'px-2 py-0.5 text-[11px] gap-1.5'
      : 'px-2.5 py-1 text-xs gap-2';

  const iconSize = size === 'xs' ? 'w-2.5 h-2.5' : size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  let text = '';
  if (displayRegion && displayZone && displayZone !== displayRegion) {
    text = `${displayRegion} (${displayZone})`;
  } else if (displayRegion && zonesList.length > 0) {
    text = `${displayRegion} (${zonesList.join(', ')})`;
  } else if (displayRegion) {
    text = displayRegion;
  } else if (displayZone) {
    text = displayZone;
  } else if (zonesList.length > 0) {
    text = zonesList.join(', ');
  }

  return (
    <span
      className={`inline-flex items-center rounded font-mono font-medium bg-zinc-900/90 text-sky-300 border border-sky-900/50 shrink-0 ${sizeClasses} ${className}`}
      title={`Region & Availability Zone: ${text}`}
    >
      <MapPin className={`${iconSize} text-sky-400 shrink-0`} />
      <span className="truncate">{text}</span>
    </span>
  );
};

interface InstanceTypeBadgeProps {
  instanceType?: string;
  instanceTypes?: string[];
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const InstanceTypeBadge: React.FC<InstanceTypeBadgeProps> = ({
  instanceType,
  instanceTypes,
  size = 'xs',
  className = ''
}) => {
  const types = Array.isArray(instanceTypes)
    ? instanceTypes.filter((t) => t && t !== 'Unknown')
    : [];

  const text =
    instanceType && instanceType !== 'Unknown'
      ? instanceType
      : types.length > 0
      ? types.join(', ')
      : null;

  if (!text) return null;

  const sizeClasses =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px] gap-1'
      : size === 'sm'
      ? 'px-2 py-0.5 text-[11px] gap-1.5'
      : 'px-2.5 py-1 text-xs gap-2';

  const iconSize = size === 'xs' ? 'w-2.5 h-2.5' : size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={`inline-flex items-center rounded font-mono font-medium bg-zinc-900/90 text-emerald-300 border border-emerald-900/50 shrink-0 ${sizeClasses} ${className}`}
      title={`Compute / Instance Type: ${text}`}
    >
      <Cpu className={`${iconSize} text-emerald-400 shrink-0`} />
      <span className="truncate">{text}</span>
    </span>
  );
};

/**
 * Node Row Infrastructure Badges:
 * Displays Provider + Region/AZ + Instance Type in a compact inline row.
 */
interface NodeInfrastructureBadgesProps {
  provider?: string;
  region?: string;
  zone?: string;
  instanceType?: string;
  className?: string;
}

export const NodeInfrastructureBadges: React.FC<NodeInfrastructureBadgesProps> = ({
  provider,
  region,
  zone,
  instanceType,
  className = ''
}) => {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {provider && <CloudProviderBadge provider={provider} size="xs" />}
      {(region || zone) && <RegionBadge region={region} zone={zone} size="xs" />}
      {instanceType && <InstanceTypeBadge instanceType={instanceType} size="xs" />}
    </div>
  );
};

/**
 * Cluster Fleet Infrastructure Badges:
 * Displays Provider + Region(s) + Instance Type(s) in the fleet card row.
 */
interface ClusterInfrastructureBadgesProps {
  provider?: string;
  region?: string;
  regions?: string[];
  zones?: string[];
  instanceTypes?: string[];
  className?: string;
}

export const ClusterInfrastructureBadges: React.FC<ClusterInfrastructureBadgesProps> = ({
  provider,
  region,
  regions,
  zones,
  instanceTypes,
  className = ''
}) => {
  const normProvider = normalizeCloudProvider(provider);
  const hasProvider = normProvider !== 'Unknown';

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {hasProvider && <CloudProviderBadge provider={provider} size="xs" />}
      <RegionBadge region={region} zones={zones} size="xs" />
      <InstanceTypeBadge instanceTypes={instanceTypes} size="xs" />
    </div>
  );
};
