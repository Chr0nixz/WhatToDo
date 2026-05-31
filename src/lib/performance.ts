const isDev = import.meta.env.DEV;
let measureSequence = 0;

const createMeasureMarks = (name: string) => {
  measureSequence += 1;
  const id = `${name}:${measureSequence}`;
  return {
    start: `${id}:start`,
    end: `${id}:end`,
  };
};

const finishMeasure = (name: string, start: string, end: string) => {
  try {
    performance.mark(end);
    performance.measure(name, start, end);
    const [measure] = performance.getEntriesByName(name).slice(-1);
    if (measure) {
      console.debug(`[perf] ${name}: ${measure.duration.toFixed(1)}ms`);
    }
    performance.clearMeasures(name);
  } catch (error) {
    console.warn(`[perf] ${name}: measurement failed`, error);
  } finally {
    performance.clearMarks(start);
    performance.clearMarks(end);
  }
};

export const measureDevAsync = async <T>(name: string, operation: () => Promise<T>): Promise<T> => {
  if (!isDev || typeof performance === "undefined") {
    return operation();
  }

  const { start, end } = createMeasureMarks(name);
  performance.mark(start);

  try {
    return await operation();
  } finally {
    finishMeasure(name, start, end);
  }
};

export const measureDev = <T>(name: string, operation: () => T): T => {
  if (!isDev || typeof performance === "undefined") {
    return operation();
  }

  const { start, end } = createMeasureMarks(name);
  performance.mark(start);

  try {
    return operation();
  } finally {
    finishMeasure(name, start, end);
  }
};
