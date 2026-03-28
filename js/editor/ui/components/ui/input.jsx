import * as React from 'react';

import { cn } from '../../utils';

const Input = React.forwardRef(({ className, type = 'text', ...props }, ref) => (
    <input
        type={type}
        ref={ref}
        className={cn(
            'flex h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-[color:var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none ring-0 placeholder:text-[color:var(--text-dim)] focus-visible:border-[color:var(--accent-glow)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-50',
            className
        )}
        {...props}
    />
));
Input.displayName = 'Input';

export { Input };
