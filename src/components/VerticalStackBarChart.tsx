import React, { useMemo, useRef } from "react";
import * as d3 from "d3";
import Title from "./shared/Title";
import XaxisBand from "./shared/XaxisBand";
import YaxisLinear from "./shared/YaxisLinear";
import { useChartContext } from "./MichiVzProvider";
import LoadingIndicator from "./shared/LoadingIndicator";

interface DataPoint {
  date: string | null;
  [key: string]: string | null | undefined;
}

interface DataSet {
  seriesKey: string;
  seriesKeyAbbreviation: string;
  series: DataPoint[];
}

interface TooltipData {
  item: DataPoint;
  key: string;
  seriesKey: string;
  series: DataPoint[];
}

interface Props {
  dataSet: DataSet[];
  keys: string[];
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  title?: string;
  xAxisFormat?: (d: number) => string;
  yAxisFormat?: (d: number) => string;
  tooltipFormatter?: (tooltipData: TooltipData) => string;
  showCombined?: boolean;
  children?: React.ReactNode;
  isLoading?: boolean;
  isLoadingComponent?: React.ReactNode;
  isNodataComponent?: React.ReactNode;
}

interface RectData {
  key: string;
  height: number;
  width: number;
  y: number;
  x: number;
  data: DataPoint;
  fill: string;
  seriesKey: string;
  seriesKeyAbbreviation: string;
  value: number | null;
  date: number;
}

const MARGIN = { top: 50, right: 50, bottom: 50, left: 50 };
const WIDTH = 900;
const HEIGHT = 480;

const VerticalStackBarChart: React.FC<Props> = ({
  dataSet,
  width = WIDTH,
  height = HEIGHT,
  margin = MARGIN,
  title,
  keys,
  xAxisFormat,
  yAxisFormat,
  tooltipFormatter,
  showCombined = false,
  children,
  isLoading = false,
  isLoadingComponent,
  isNodataComponent,
}) => {
  const { colorsMapping, highlightItems, setHighlightItems, disabledItems } =
    useChartContext();
  const ref = useRef<SVGSVGElement>(null);
  const flattenedDataSet = useMemo(() => {
    return dataSet
      .map(({ series }) => series)
      .flat()
      .map((dataPoint) => {
        // Convert the DataPoint object to an array of [key, value] pairs.
        const entries = Object.entries(dataPoint);
        // Filter out the keys that are present in the disabledItems array.
        const filteredEntries = entries.filter(
          ([key]) => !disabledItems.includes(key),
        );
        // Convert the filtered [key, value] pairs back to an object.
        return Object.fromEntries(filteredEntries);
      });
  }, [dataSet, disabledItems]);

  // xScale
  const extractDates = (data: DataPoint): string => String(data.date);
  const dates = useMemo(
    () => flattenedDataSet.map(extractDates),
    [flattenedDataSet, disabledItems],
  );

  const xScale = useMemo(
    () =>
      d3
        .scaleBand()
        .domain(dates)
        .range([margin.left, width - margin.right])
        .padding(0.1),
    [flattenedDataSet, width, height, margin, disabledItems],
  );

  // yScale
  const yScaleDomain = useMemo(() => {
    const totalValuePerYear: number[] = flattenedDataSet.map((yearData) =>
      keys.reduce(
        (acc, key) => acc + (yearData[key] ? parseFloat(yearData[key]) : 0),
        0,
      ),
    );
    return [Math.min(...totalValuePerYear), Math.max(...totalValuePerYear)];
  }, [flattenedDataSet, keys]);

  const yScale = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain(yScaleDomain)
        .range([height - margin.bottom, margin.top])
        .clamp(true)
        .nice(),
    [flattenedDataSet, width, height, margin, disabledItems],
  );

  const prepareStackedData = (
    rawDataSet: DataSet[],
  ): { [p: string]: RectData[] } => {
    const stackedData = keys
      .filter((key) => !disabledItems.includes(key))
      .reduce(
        (acc, key) => {
          acc[key] = [];
          return acc;
        },
        {} as { [key: string]: RectData[] },
      );

    rawDataSet.forEach((dataItem, groupIndex) => {
      const series = dataItem.series;
      const groupWidth = xScale.bandwidth() / rawDataSet.length;

      series.forEach((yearData) => {
        let y0 = 0;
        keys
          .filter((key) => !disabledItems.includes(key))
          .sort()
          .forEach((key) => {
            const y1 =
              parseFloat(String(y0)) +
              parseFloat((yearData[key] || 0) as unknown as string);
            const itemHeight = yScale(y0) - yScale(y1);
            const rectData = {
              key,
              height: itemHeight,
              width: groupWidth - 4, // adjust the width here
              y: yScale(y1), // adjust the x position based on groupIndex
              x:
                xScale(String(yearData.date)) +
                groupWidth * groupIndex +
                groupWidth / 2 -
                groupWidth / 2 +
                2,
              fill: colorsMapping[key],
              data: yearData,
              seriesKey: dataItem.seriesKey,
              seriesKeyAbbreviation: dataItem.seriesKeyAbbreviation,
              value: yearData[key],
              date: yearData.date,
            };
            y0 = y1;
            stackedData[key].push(rectData as unknown as RectData);
          });
      });
    });

    return stackedData;
  };

  const stackedRectData = useMemo(
    () => prepareStackedData(dataSet),
    [dataSet, width, height, margin, colorsMapping, disabledItems],
  );
  const generateTooltipContent = (
    key: string,
    seriesKey: string,
    data: DataPoint,
    series: DataPoint[],
  ) => {
    if (tooltipFormatter) {
      return tooltipFormatter({
        item: data,
        key: key,
        seriesKey: seriesKey,
        series: series,
      });
    }

    if (!showCombined) {
      return `
                <div style="background: #fff; padding: 5px">
                    <p>${data.date} - ${seriesKey}</p>
                    ${
                      data[key]
                        ? `<p style="color:${colorsMapping[key]}">${key}: ${data[key]}</p>`
                        : "N/A"
                    }
                </div>`;
    }
    // Process your data and generate HTML string as per requirements
    return `
                <div style="background: #fff; padding: 5px">
                    <p>${data.date} - ${seriesKey}</p>
                    ${Object.keys(data)
                      .filter((key) => key !== "date")
                      .sort()
                      .map(
                        (key) =>
                          `<p style="color:${colorsMapping[key]}">${key}: ${
                            data[key] ?? "N/A"
                          }</p>`,
                      )
                      .join("")}
                </div>`;
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        className={"tooltip"}
        style={{
          position: "absolute",
          background: "white",
          padding: "5px",
          pointerEvents: "none",
          zIndex: 1000,
          visibility: "hidden",
        }}
      />

      <svg
        className={"chart"}
        ref={ref}
        width={width}
        height={height}
        style={{ overflow: "visible" }}
        onMouseOut={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setHighlightItems([]);
          d3.select(".tooltip").style("visibility", "hidden");
        }}
      >
        {children}
        <Title x={width / 2} y={MARGIN.top / 2}>
          {title}
        </Title>
        <XaxisBand
          xScale={xScale}
          height={height}
          margin={margin}
          xAxisFormat={xAxisFormat}
        />
        <YaxisLinear
          yScale={yScale}
          width={width}
          height={height}
          margin={margin}
          highlightZeroLine={true}
          yAxisFormat={yAxisFormat}
        />
        <g>
          {keys.map((key) => {
            return (
              <g key={key}>
                {stackedRectData[key] &&
                  stackedRectData[key].map((d: RectData, i: number) => {
                    return (
                      <React.Fragment key={`item-${i}`}>
                        <rect
                          x={d.x}
                          y={d.y}
                          width={d.width}
                          height={d.height}
                          fill={d.fill ?? "transparent"}
                          rx={2}
                          stroke={"#fff"}
                          className={`bar`}
                          opacity={
                            highlightItems.length === 0 ||
                            highlightItems.includes(key)
                              ? 1
                              : 0.2
                          }
                          ref={(node) => {
                            if (node) {
                              d3.select(node)
                                .on("mouseover", function () {
                                  setHighlightItems([key]);
                                  d3.select(".tooltip")
                                    .style("visibility", "visible")
                                    .html(
                                      generateTooltipContent(
                                        d.key,
                                        d.seriesKey,
                                        d.data,
                                        stackedRectData[key]
                                          .filter(
                                            (item) =>
                                              item.seriesKey === d.seriesKey,
                                          )
                                          .map((item) => ({
                                            label: item.key,
                                            value: item.value ?? null,
                                            date: item.date,
                                          })) as unknown as DataPoint[],
                                      ),
                                    ); // you can define this function or inline its logic
                                })
                                .on("mousemove", function (event) {
                                  const [x, y] = d3.pointer(event);
                                  const tooltip = d3
                                    .select(".tooltip")
                                    .node() as HTMLElement;
                                  const tooltipWidth =
                                    tooltip.getBoundingClientRect().width;
                                  const tooltipHeight =
                                    tooltip.getBoundingClientRect().height;

                                  d3.select(".tooltip")
                                    .style("left", x - tooltipWidth / 2 + "px")
                                    .style(
                                      "top",
                                      y - tooltipHeight - 10 + "px",
                                    );
                                })
                                .on("mouseout", function () {
                                  setHighlightItems([]);
                                  d3.select(".tooltip").style(
                                    "visibility",
                                    "hidden",
                                  );
                                });
                            }
                          }}
                        />
                        {d.seriesKeyAbbreviation && (
                          <text
                            x={d.x + d.width / 2}
                            y={height - margin.bottom + 15}
                            textAnchor="middle"
                            fontSize="12"
                            fill="#000"
                            className={"x-axis-label"}
                          >
                            {d.seriesKeyAbbreviation}
                          </text>
                        )}
                      </React.Fragment>
                    );
                  })}
              </g>
            );
          })}
        </g>
      </svg>
      {isLoading && isLoadingComponent && <>{isLoadingComponent}</>}
      {isLoading && !isLoadingComponent && <LoadingIndicator />}
      {!isLoading && dataSet.length === 0 && isNodataComponent && (
        <>{isNodataComponent}</>
      )}
    </div>
  );
};

export default VerticalStackBarChart;
