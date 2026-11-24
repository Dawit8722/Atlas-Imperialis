import React, { useMemo } from 'react';
import type { BaseShape } from '../engine/heraldry';
import type { CoatOfArmsData } from '../types/world';
import {
  renderUnheraldedSealSvg,
  resolveHeraldryResult,
  resolveImpaledMarriageResult,
} from '../utils/heraldryBridge';

interface HeraldryShieldProps {
  coatOfArms?: CoatOfArmsData;
  seed?: string;
  shape?: BaseShape;
  size?: number;
  width?: number;
  height?: number;
  sheen?: boolean;
  outline?: boolean;
  className?: string;
  showTooltip?: boolean;
  unheralded?: boolean;
}

export const HeraldryShield: React.FC<HeraldryShieldProps> = ({
  coatOfArms,
  seed = 'unknown_house',
  shape,
  size = 40,
  width,
  height,
  sheen = true,
  outline = true,
  className = '',
  showTooltip = true,
  unheralded = false,
}) => {
  const w = width ?? size;
  const h = height ?? Math.round(w * 1.2);

  const result = useMemo(() => {
    if (unheralded && !coatOfArms) {
      return {
        svg: renderUnheraldedSealSvg(w, h),
        blazon: 'Unheralded Commoner — No Personal Banner (Bestowable only by a Duke or King)',
      };
    }
    return resolveHeraldryResult(coatOfArms, seed, {
      shape,
      width: w,
      height: h,
      sheen,
      outline,
    });
  }, [coatOfArms, seed, shape, w, h, sheen, outline, unheralded]);

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 select-none drop-shadow-md ${className}`}
      style={{ width: w, height: h }}
      title={showTooltip ? result.blazon : undefined}
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  );
};

interface ImpaledMarriageShieldProps {
  dexterArms?: CoatOfArmsData;
  dexterSeed: string;
  sinisterArms?: CoatOfArmsData;
  sinisterSeed: string;
  shape?: BaseShape;
  size?: number;
  className?: string;
}

export const ImpaledMarriageShield: React.FC<ImpaledMarriageShieldProps> = ({
  dexterArms,
  dexterSeed,
  sinisterArms,
  sinisterSeed,
  shape,
  size = 44,
  className = '',
}) => {
  const w = size;
  const h = Math.round(w * 1.2);

  const result = useMemo(
    () =>
      resolveImpaledMarriageResult(dexterArms, dexterSeed, sinisterArms, sinisterSeed, {
        shape,
        width: w,
        height: h,
      }),
    [dexterArms, dexterSeed, sinisterArms, sinisterSeed, shape, w, h]
  );

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 select-none drop-shadow-md ${className}`}
      style={{ width: w, height: h }}
      title={result.blazon}
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  );
};
