export function formatFlooredTotal(value) {
    const floored = Math.floor(Number(value) || 0);

    return String(floored).replace('-', '−');
}
