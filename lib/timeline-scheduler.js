/**
 * Normalize PowerPoint animation timing into scheduled click groups.
 * Respects onClick / withPrevious / afterPrevious without arbitrary timeouts.
 */

const TRIGGER = {
  on_click: 'onClick',
  with_previous: 'withPrevious',
  after_previous: 'afterPrevious',
  automatic: 'automatic',
};

function normalizeTrigger(raw) {
  return TRIGGER[raw] || raw || 'onClick';
}

function isObjectClickTrigger(entry) {
  return (
    entry.trigger === 'object_click' ||
    entry.trigger === 'objectClick' ||
    entry.triggerDetail?.type === 'objectClick' ||
    entry.trigger?.type === 'objectClick'
  );
}

function partitionTimeline(timeline) {
  const main = [];
  const objectClick = [];
  for (const entry of timeline || []) {
    if (isObjectClickTrigger(entry)) objectClick.push(entry);
    else main.push(entry);
  }
  return { main, objectClick };
}

function isClickTrigger(entry) {
  return entry.trigger === 'on_click' || entry.trigger === 'onClick';
}

function isAutomaticTrigger(entry) {
  return entry.trigger === 'automatic' || entry.trigger === 'onBegin';
}

function isWithPrevious(entry) {
  return entry.trigger === 'with_previous' || entry.trigger === 'withPrevious';
}

function isAfterPrevious(entry) {
  return entry.trigger === 'after_previous' || entry.trigger === 'afterPrevious';
}

/** Split timeline into click groups (each group = one Next/click). */
function buildClickGroups(timeline) {
  const groups = [];
  let current = [];
  for (const entry of timeline || []) {
    if (isClickTrigger(entry) && current.length) {
      groups.push(current);
      current = [];
    }
    if (isAutomaticTrigger(entry) && current.length) {
      groups.push(current);
      current = [];
    }
    current.push(entry);
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * Schedule startAt (ms from click) for entries within one click group.
 */
function scheduleClickGroup(entries) {
  let groupEnd = 0;
  let prevStart = 0;
  let prevEnd = 0;

  return (entries || []).map((entry, index) => {
    const delay = entry.delay || 0;
    const duration = entry.duration || 500;
    let startAt = 0;

    if (index === 0) {
      startAt = delay;
    } else if (isWithPrevious(entry)) {
      startAt = prevStart + delay;
    } else if (isAfterPrevious(entry)) {
      startAt = prevEnd + delay;
    } else if (entry.trigger === 'automatic') {
      startAt = groupEnd + delay;
    } else {
      startAt = delay;
    }

    const endAt = startAt + duration;
    prevStart = isWithPrevious(entry) ? prevStart : startAt;
    prevEnd = endAt;
    groupEnd = Math.max(groupEnd, endAt);

    return {
      ...entry,
      startAt,
      endAt,
      groupDuration: groupEnd,
    };
  });
}

/** Full slide schedule: clickSteps with per-entry startAt. */
function scheduleSlideTimeline(timeline) {
  const groups = buildClickGroups(timeline);
  return groups.map((group) => scheduleClickGroup(group));
}

function clickStepDuration(batch) {
  if (!batch?.length) return 0;
  return Math.max(...batch.map((e) => e.endAt ?? (e.startAt || 0) + (e.duration || 500)));
}

module.exports = {
  buildClickGroups,
  scheduleClickGroup,
  scheduleSlideTimeline,
  clickStepDuration,
  normalizeTrigger,
  partitionTimeline,
  isObjectClickTrigger,
};
