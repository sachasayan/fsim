export const TOOL_SHORTCUTS = {
    v: 'select',
    h: 'pan',
    c: 'add-city',
    d: 'add-district',
    w: 'add-road',
    e: 'edit-poly',
    r: 'terrain-raise',
    l: 'terrain-lower',
    f: 'terrain-flatten'
};

export const CONTROL_GROUPS = [
    { ids: ['prop-terrain-radius', 'prop-terrain-radius-range'], valueId: 'prop-terrain-radius-value' },
    { ids: ['prop-terrain-delta', 'prop-terrain-delta-range'], valueId: 'prop-terrain-delta-value' },
    { ids: ['prop-terrain-target', 'prop-terrain-target-range'], valueId: 'prop-terrain-target-value' },
    { ids: ['prop-terrain-opacity', 'prop-terrain-opacity-range'], valueId: 'prop-terrain-opacity-value' },
    { ids: ['prop-road-width', 'prop-road-width-range'], valueId: 'prop-road-width-value' },
    { ids: ['prop-road-feather', 'prop-road-feather-range'], valueId: 'prop-road-feather-value' },
    { ids: ['prop-alt', 'prop-alt-range'], valueId: 'prop-alt-value' },
    { ids: ['prop-tilt', 'prop-tilt-range'], valueId: 'prop-tilt-value' },
    { ids: ['terrain-brush-radius', 'terrain-brush-radius-range'], valueId: 'terrain-brush-radius-value' },
    { ids: ['terrain-brush-strength', 'terrain-brush-strength-range'], valueId: 'terrain-brush-strength-value' }
];

export const CONTROL_GROUP_BY_ID = new Map(
    CONTROL_GROUPS.flatMap(group => group.ids.map(id => [id, group]))
);

export const COLORS = {
    city: 'rgba(76, 201, 240, 0.4)',
    citySelected: 'rgba(76, 201, 240, 0.8)',
    runway: 'rgba(255, 255, 255, 0.5)',
    district: 'rgba(255, 255, 100, 0.2)',
    districtSelected: 'rgba(255, 255, 100, 0.6)',
    road: 'rgba(255, 159, 67, 0.9)',
    roadSelected: 'rgba(255, 236, 179, 1)',
    accent: '#7dd3fc',
    grid: 'rgba(255, 255, 255, 0.05)',
    vantage: 'rgba(158, 255, 102, 0.6)',
    vantageSelected: 'rgba(158, 255, 102, 1.0)'
};
