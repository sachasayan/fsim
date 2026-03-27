import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '../../utils.js';

const Slider = React.forwardRef(({ className, thumbTestId, thumbAriaLabel, ...props }, ref) => (
    <SliderPrimitive.Root
        ref={ref}
        className={cn('relative flex w-full touch-none select-none items-center', className)}
        {...props}
    >
        <SliderPrimitive.Track className="relative h-2.5 w-full grow overflow-hidden rounded-full bg-white/8">
            <SliderPrimitive.Range className="absolute h-full bg-[linear-gradient(90deg,rgba(125,211,252,0.95),rgba(56,189,248,0.86))]" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
            className="block size-4 rounded-full border border-white/40 bg-[color:var(--accent-strong)] shadow-[0_0_0_4px_rgba(56,189,248,0.16)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] disabled:pointer-events-none disabled:opacity-50"
            data-testid={thumbTestId}
            aria-label={thumbAriaLabel}
        />
    </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
