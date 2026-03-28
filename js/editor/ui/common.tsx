import * as React from 'react';

import type { EditorStore } from '../core/types.js';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Input } from './components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Separator } from './components/ui/separator';
import { Slider } from './components/ui/slider';
import { Toggle } from './components/ui/toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';
import { cn } from './utils';

type ComparableRecord = Record<string, unknown>;

type ClassNameProp = {
    className?: string;
};

type ChildrenProp = {
    children?: React.ReactNode;
};

type Tone = 'default' | 'dirty' | 'clean' | 'danger' | 'info';

export function shallowEqual<T extends ComparableRecord>(valueA: T, valueB: T): boolean;
export function shallowEqual(valueA: unknown, valueB: unknown): boolean;
export function shallowEqual(valueA: unknown, valueB: unknown): boolean {
    if (Object.is(valueA, valueB)) return true;
    if (!valueA || !valueB || typeof valueA !== 'object' || typeof valueB !== 'object') return false;

    const keysA = Object.keys(valueA);
    const keysB = Object.keys(valueB);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(valueB, key) || !Object.is((valueA as ComparableRecord)[key], (valueB as ComparableRecord)[key])) {
            return false;
        }
    }
    return true;
}

export function useStore<Selected>(
    store: EditorStore,
    selector: (state: ReturnType<EditorStore['getState']>) => Selected,
    isEqual: (valueA: Selected, valueB: Selected) => boolean = Object.is
): Selected {
    const selectorRef = React.useRef(selector);
    const isEqualRef = React.useRef(isEqual);
    const hasSnapshotRef = React.useRef(false);
    const snapshotRef = React.useRef<Selected | undefined>(undefined);

    selectorRef.current = selector;
    isEqualRef.current = isEqual;

    const getSnapshot = React.useCallback(() => {
        const nextValue = selectorRef.current(store.getState());
        if (hasSnapshotRef.current && snapshotRef.current !== undefined && isEqualRef.current(snapshotRef.current, nextValue)) {
            return snapshotRef.current;
        }
        hasSnapshotRef.current = true;
        snapshotRef.current = nextValue;
        return nextValue;
    }, [store]);

    return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function formatControlValue(value: number): string {
    if (!Number.isFinite(value)) return '';
    if (Math.abs(value) >= 100 || Number.isInteger(value)) return String(Math.round(value));
    return value.toFixed(2).replace(/\.?0+$/, '');
}

export function numberFieldTestId(label: string): string {
    return `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function Icon({ path, className }: { path: string; className?: string }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-4 shrink-0', className)}>
            <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function SpinnerIcon({ className }: ClassNameProp) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-4 shrink-0 animate-spin', className)}>
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.2" />
            <path d="M12 4a8 8 0 0 1 8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}

export function StatusChip({
    testId,
    tone = 'default',
    iconPath,
    children
}: {
    testId?: string;
    tone?: Exclude<Tone, 'danger' | 'info'>;
    iconPath?: string;
    children?: React.ReactNode;
}) {
    return (
        <span
            className={cn(
                'editor-status-chip',
                tone === 'dirty' && 'border-amber-400/25 bg-amber-400/8 text-amber-100',
                tone === 'clean' && 'border-[color:var(--accent-glow)] bg-[rgba(56,189,248,0.08)] text-[color:var(--accent-strong)]'
            )}
            data-testid={testId}
        >
            {iconPath ? <Icon path={iconPath} className="size-3.5" /> : null}
            <span>{children}</span>
        </span>
    );
}

export function Panel({
    title,
    copy,
    badge,
    children,
    testId,
    className
}: {
    title?: React.ReactNode;
    copy?: React.ReactNode;
    badge?: React.ReactNode;
    children?: React.ReactNode;
    testId?: string;
    className?: string;
}) {
    return (
        <Card className={cn('editor-card', className)} data-testid={testId}>
            <CardContent className="flex flex-col gap-4 p-4">
                {(title || copy || badge) ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            {title ? <div className="editor-section-title">{title}</div> : null}
                            {badge ? badge : null}
                        </div>
                        {copy ? <p className="editor-panel-copy">{copy}</p> : null}
                    </div>
                ) : null}
                {children}
            </CardContent>
        </Card>
    );
}

export function HintCard({ className, tone = 'default', children }: ClassNameProp & ChildrenProp & { tone?: Tone }) {
    return (
        <div
            className={cn(
                'editor-hint-card',
                tone === 'danger' && 'border-red-400/20 bg-red-400/8 text-red-100',
                tone === 'info' && 'border-sky-400/20 bg-sky-400/8 text-sky-50',
                className
            )}
        >
            {children}
        </div>
    );
}

export function FieldRow({ label, children, value }: ChildrenProp & { label: React.ReactNode; value?: React.ReactNode }) {
    return (
        <div className="editor-field">
            <div className="editor-field-label">
                <label>{label}</label>
                {value !== undefined ? <span className="editor-value-pill">{value}</span> : null}
            </div>
            {children}
        </div>
    );
}

export function DockIntro({ title, copy, className }: ClassNameProp & { title: React.ReactNode; copy?: React.ReactNode }) {
    return (
        <div className={cn('editor-dock-intro', className)}>
            <div className="editor-section-title">{title}</div>
            {copy ? <p className="editor-panel-copy">{copy}</p> : null}
        </div>
    );
}

export function SectionHeading({ children, className }: ChildrenProp & ClassNameProp) {
    return <div className={cn('editor-subsection-title', className)}>{children}</div>;
}

export function SurfaceIcon({ compact = false, className, children }: ChildrenProp & ClassNameProp & { compact?: boolean }) {
    return (
        <span className={cn(compact ? 'editor-icon-surface-compact' : 'editor-icon-surface', className)}>
            {children}
        </span>
    );
}

export function CheckboxField({
    label,
    checked,
    onCheckedChange,
    disabled
}: {
    label: React.ReactNode;
    checked?: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <FieldRow label={label}>
            <label className="editor-checkbox-row">
                <input
                    type="checkbox"
                    checked={checked === true}
                    disabled={disabled}
                    onChange={(event) => onCheckedChange(event.target.checked)}
                />
                <span>{label}</span>
            </label>
        </FieldRow>
    );
}

export function NumberInputField({
    label,
    value,
    disabled,
    onChange,
    testId
}: {
    label: string;
    value?: number | string | null;
    disabled?: boolean;
    onChange: React.ChangeEventHandler<HTMLInputElement>;
    testId?: string;
}) {
    return (
        <FieldRow label={label}>
            <Input
                type="number"
                disabled={disabled}
                value={value ?? 0}
                onChange={onChange}
                data-testid={testId || numberFieldTestId(label)}
            />
        </FieldRow>
    );
}

type SelectOption = {
    value: string | number;
    label: React.ReactNode;
};

export function SelectField({
    label,
    value,
    options,
    onChange,
    disabled,
    testId
}: {
    label: React.ReactNode;
    value: string | number;
    options: SelectOption[];
    onChange: (value: string) => void;
    disabled?: boolean;
    testId?: string;
}) {
    return (
        <FieldRow label={label}>
            <Select value={String(value)} onValueChange={onChange} disabled={disabled}>
                <SelectTrigger data-testid={testId}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={String(option.value)} value={String(option.value)}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </FieldRow>
    );
}

export function RangeNumberField({
    label,
    value,
    min,
    max,
    step,
    disabled,
    onChange
}: {
    label: string;
    value: number | string | null | undefined;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    onChange: (value: number) => void;
}) {
    const safeValue = Number.isFinite(Number(value)) ? Number(value) : Number(min || 0);
    const baseTestId = numberFieldTestId(label);
    return (
        <FieldRow label={label} value={formatControlValue(safeValue)}>
            <div className="editor-range-row">
                <Slider
                    min={min}
                    max={max}
                    step={step}
                    disabled={disabled}
                    value={[safeValue]}
                    onValueChange={(next: number[]) => onChange(Number(next[0]))}
                    data-testid={`${baseTestId}-slider`}
                    thumbTestId={`${baseTestId}-slider-thumb`}
                    thumbAriaLabel={label}
                />
                <Input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    disabled={disabled}
                    value={safeValue}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))}
                    data-testid={`${baseTestId}-number`}
                />
            </div>
        </FieldRow>
    );
}

export function ToolButton({
    active,
    id,
    label,
    shortcut,
    onClick,
    compact = false,
    children
}: ChildrenProp & {
    active?: boolean;
    id: string;
    label: string;
    shortcut: string;
    onClick: () => void;
    compact?: boolean;
}) {
    return (
        <Tooltip>
            <TooltipTrigger>
                <Toggle
                    pressed={active}
                    onPressedChange={() => onClick()}
                    id={id}
                    className={cn(compact ? 'editor-tool-toggle-compact' : 'editor-tool-toggle', active && 'active')}
                    data-testid={id}
                    aria-label={`${label} (${shortcut})`}
                >
                    <SurfaceIcon>{children}</SurfaceIcon>
                    {compact ? null : (
                        <span className="flex flex-col items-center gap-1">
                            <span className="text-sm font-bold uppercase tracking-[0.12em] text-[color:var(--text)]">{label}</span>
                            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">{shortcut}</span>
                        </span>
                    )}
                </Toggle>
            </TooltipTrigger>
            <TooltipContent>{`${label} (${shortcut})`}</TooltipContent>
        </Tooltip>
    );
}

export function CommandButton({
    testId,
    title,
    onClick,
    iconPath,
    children,
    variant = 'secondary',
    className,
    disabled = false,
    busy = false
}: ChildrenProp &
    ClassNameProp & {
        testId?: string;
        title: React.ReactNode;
        onClick: () => void;
        iconPath?: string;
        variant?: 'default' | 'secondary' | 'accent' | 'danger' | 'ghost';
        disabled?: boolean;
        busy?: boolean;
    }) {
    return (
        <Tooltip>
            <TooltipTrigger>
                <Button
                    type="button"
                    onClick={onClick}
                    disabled={disabled}
                    data-testid={testId}
                    variant={variant}
                    className={cn('h-11 rounded-2xl px-4', className)}
                >
                    {busy ? <SpinnerIcon /> : iconPath ? <Icon path={iconPath} /> : null}
                    <span>{children}</span>
                </Button>
            </TooltipTrigger>
            <TooltipContent>{title}</TooltipContent>
        </Tooltip>
    );
}

export { Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn };
