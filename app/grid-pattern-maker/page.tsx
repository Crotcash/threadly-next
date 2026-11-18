
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
  MouseEvent,
} from "react";

import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/app/lib/firebase";

type GridCell = 0 | 1; // 0 = white, 1 = black

const DEFAULT_ROWS = 40;
const DEFAULT_COLUMNS = 40;
const MAX_DIMENSION = 200;
const MIN_DIMENSION = 5;

// Automatically calculates the threshold for converting an image
// into strictly black and white pixels.
function calculateOtsuThreshold(pixels: Uint8ClampedArray) {
  const histogram = new Array(256).fill(0);
  const total = pixels.length / 4;

  for (let i = 0; i < pixels.length; i += 4) {
    const gray = Math.round(
      0.299 * pixels[i] +
        0.587 * pixels[i + 1] +
        0.114 * pixels[i + 2]
    );

    histogram[gray]++;
  }

  let sum = 0;

  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maximumVariance = 0;
  let threshold = 127;

  for (let i = 0; i < 256; i++) {
    weightBackground += histogram[i];

    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;

    if (weightForeground === 0) break;

    sumBackground += i * histogram[i];

    const meanBackground = sumBackground / weightBackground;
    const meanForeground =
      (sum - sumBackground) / weightForeground;

    const variance =
      weightBackground *
      weightForeground *
      Math.pow(meanBackground - meanForeground, 2);

    if (variance > maximumVariance) {
      maximumVariance = variance;
      threshold = i;
    }
  }

  return threshold;
}

// Draws the crochet grid on a canvas.
function drawGrid(
  canvas: HTMLCanvasElement,
  cells: GridCell[][],
  showLines: boolean,
  exportMode = false
) {
  const rows = cells.length;
  const columns = cells[0]?.length ?? 0;

  if (!rows || !columns) return;

  const cellSize = exportMode
    ? 20
    : Math.min(18, 900 / columns, 900 / rows);

  const width = columns * cellSize;
  const height = rows * cellSize;

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) return;

  // White background.
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, width, height);

  // Draw every stitch as either black or white.
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      context.fillStyle =
        cells[row][column] === 1 ? "#000000" : "#FFFFFF";

      context.fillRect(
        column * cellSize,
        row * cellSize,
        cellSize,
        cellSize
      );
    }
  }

  // Optional grid lines.
  if (showLines) {
    context.beginPath();
    context.strokeStyle = "#A3A3A3";
    context.lineWidth = exportMode ? 0.6 : 0.7;

    for (let column = 0; column <= columns; column++) {
      const x = column * cellSize;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }

    for (let row = 0; row <= rows; row++) {
      const y = row * cellSize;
      context.moveTo(0, y);
      context.lineTo(width, y);
    }

    context.stroke();
  }
}

export default function GridPatternMakerPage() {
  const router = useRouter();

  // Authentication state.
  const [authLoading, setAuthLoading] = useState(true);

  // Grid settings.
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [cells, setCells] = useState<GridCell[][]>([]);

  // Image and interface state.
  const [imageName, setImageName] = useState("");
  const [showLines, setShowLines] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState(false);

  // References.
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Count black and white stitches.
  const blackCount = cells.reduce(
    (total, row) =>
      total + row.filter((cell) => cell === 1).length,
    0
  );

  const whiteCount = cells.length
    ? rows * columns - blackCount
    : 0;

  // Check that the user is logged in and has a creative account.
  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (active) {
          router.replace("/login");
        }
        return;
      }

      try {
        const userSnapshot = await getDoc(
          doc(db, "users", user.uid)
        );

        if (!active) return;

        if (!userSnapshot.exists()) {
          router.replace("/login");
          return;
        }

        const role = userSnapshot.data().role;

        if (role !== "creative" && role !== "creator") {
          router.replace("/home");
          return;
        }

        setAuthLoading(false);
      } catch (authError) {
        console.error(
          "Could not verify creative access:",
          authError
        );

        if (active) {
          router.replace("/login");
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  // Convert the uploaded image into a black-and-white grid.
  const convertImage = useCallback(
    (
      image: HTMLImageElement,
      targetRows: number,
      targetColumns: number
    ) => {
      const processingCanvas = document.createElement("canvas");

      processingCanvas.width = targetColumns;
      processingCanvas.height = targetRows;

      const context = processingCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!context) {
        throw new Error(
          "Your browser could not process this image."
        );
      }

      // Preserve image proportions and fill unused space with white.
      context.fillStyle = "#FFFFFF";
      context.fillRect(
        0,
        0,
        targetColumns,
        targetRows
      );

      const scale = Math.min(
        targetColumns / image.naturalWidth,
        targetRows / image.naturalHeight
      );

      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;

      const offsetX = (targetColumns - drawWidth) / 2;
      const offsetY = (targetRows - drawHeight) / 2;

      context.drawImage(
        image,
        offsetX,
        offsetY,
        drawWidth,
        drawHeight
      );

      const imageData = context.getImageData(
        0,
        0,
        targetColumns,
        targetRows
      );

      // Calculate automatic black-and-white threshold.
      const threshold = calculateOtsuThreshold(
        imageData.data
      );

      const newCells: GridCell[][] = [];

      for (let row = 0; row < targetRows; row++) {
        const currentRow: GridCell[] = [];

        for (
          let column = 0;
          column < targetColumns;
          column++
        ) {
          const index =
            (row * targetColumns + column) * 4;

          const gray =
            0.299 * imageData.data[index] +
            0.587 * imageData.data[index + 1] +
            0.114 * imageData.data[index + 2];

          currentRow.push(gray <= threshold ? 1 : 0);
        }

        newCells.push(currentRow);
      }

      setCells(newCells);
      setGenerated(true);
      setError("");
    },
    []
  );

  // Redraw the preview whenever the grid or grid-line setting changes.
  useEffect(() => {
    if (cells.length && previewCanvasRef.current) {
      drawGrid(
        previewCanvasRef.current,
        cells,
        showLines
      );
    }
  }, [cells, showLines]);

  // Upload and process an image.
  const handleUpload = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setError("");
    setGenerated(false);

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("Please upload a JPG, PNG or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Your image must be smaller than 10 MB.");
      event.target.value = "";
      return;
    }

    setLoading(true);

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      sourceImageRef.current = image;
      setImageName(file.name);

      try {
        convertImage(image, rows, columns);
      } catch (conversionError) {
        console.error(conversionError);
        setError(
          "Unable to process this image. Please try another."
        );
      } finally {
        setLoading(false);
        URL.revokeObjectURL(objectUrl);
      }
    };

    image.onerror = () => {
      setError("The uploaded image could not be opened.");
      setLoading(false);
      URL.revokeObjectURL(objectUrl);
    };

    image.src = objectUrl;

    // Allow the same file to be selected again.
    event.target.value = "";
  };

  // Change the number of rows and columns independently.
  const handleResize = (
    newRows: number,
    newColumns: number
  ) => {
    if (
      !Number.isInteger(newRows) ||
      !Number.isInteger(newColumns) ||
      newRows < MIN_DIMENSION ||
      newColumns < MIN_DIMENSION ||
      newRows > MAX_DIMENSION ||
      newColumns > MAX_DIMENSION
    ) {
      setError("Rows and columns must be between 5 and 200.");
      return;
    }

    setRows(newRows);
    setColumns(newColumns);
    setError("");

    if (sourceImageRef.current) {
      try {
        convertImage(
          sourceImageRef.current,
          newRows,
          newColumns
        );
      } catch (resizeError) {
        console.error(resizeError);
        setError("Unable to resize the grid.");
      }
    }
  };

  // Edit an individual grid square by clicking it.
  const toggleCell = (
    event: MouseEvent<HTMLCanvasElement>
  ) => {
    const canvas = previewCanvasRef.current;

    if (!canvas || !cells.length) return;

    const rect = canvas.getBoundingClientRect();

    const column = Math.floor(
      ((event.clientX - rect.left) / rect.width) *
        columns
    );

    const row = Math.floor(
      ((event.clientY - rect.top) / rect.height) *
        rows
    );

    if (
      row < 0 ||
      row >= rows ||
      column < 0 ||
      column >= columns
    ) {
      return;
    }

    setCells((previous) =>
      previous.map((currentRow, rowIndex) =>
        currentRow.map((cell, columnIndex) =>
          rowIndex === row && columnIndex === column
            ? cell === 1
              ? 0
              : 1
            : cell
        )
      )
    );
  };

  // Regenerate the grid using the current dimensions.
  const regenerateGrid = () => {
    if (!sourceImageRef.current) return;

    try {
      convertImage(
        sourceImageRef.current,
        rows,
        columns
      );
    } catch (regenerateError) {
      console.error(regenerateError);
      setError("Unable to regenerate the grid.");
    }
  };

  // Download the grid as a PNG image.
  const downloadPNG = () => {
    if (!cells.length) return;

    const canvas = document.createElement("canvas");

    drawGrid(canvas, cells, showLines, true);

    const link = document.createElement("a");

    link.download = "threadly-crochet-grid.png";
    link.href = canvas.toDataURL("image/png");

    link.click();
  };

  // Clear the current grid.
  const resetGrid = () => {
    setCells([]);
    setImageName("");
    setGenerated(false);
    setError("");
    sourceImageRef.current = null;

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Open the browser print dialog.
  const printPattern = () => {
    if (!cells.length) return;

    window.print();
  };

  // Do not display the feature until access is verified.
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080D1B] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-blue-500" />
          <p className="text-sm text-slate-300">
            Checking creative access...
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#080D1B] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl space-y-8">

        {/* Page heading */}
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-400">
            Threadly Creator Studio
          </p>

          <h1 className="text-3xl font-bold sm:text-4xl">
            Grid Pattern Maker
          </h1>

          <p className="max-w-2xl text-sm leading-6 text-slate-400">
            Turn your favourite pictures into black-and-white
            tapestry crochet grids. Upload, convert, customise
            and download your pattern.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[340px_1fr]">

          {/* LEFT PANEL */}
          <aside className="space-y-5 rounded-2xl border border-slate-800 bg-[#10182B] p-5">

            {/* Upload image */}
            <div>
              <h2 className="text-lg font-semibold">
                1. Upload image
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                JPG, PNG or WebP. Maximum size: 10 MB.
              </p>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-36 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-blue-500/50 bg-blue-500/5 p-5 text-center transition hover:border-blue-400 hover:bg-blue-500/10"
            >
              <span className="text-3xl">＋</span>

              <span className="font-medium">
                Choose an image
              </span>

              <span className="text-xs text-slate-400">
                Select a file from your device
              </span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleUpload}
              className="hidden"
            />

            {imageName && (
              <div className="break-all rounded-lg bg-slate-900 p-3 text-sm text-slate-300">
                <span className="text-blue-400">
                  Uploaded:
                </span>{" "}
                {imageName}
              </div>
            )}

            {/* Grid dimensions */}
            <div className="border-t border-slate-800 pt-5">
              <h2 className="text-lg font-semibold">
                2. Grid dimensions
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Set the number of squares independently.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">

                <label className="space-y-2 text-sm">
                  <span className="text-slate-400">
                    Rows
                  </span>

                  <input
                    type="number"
                    min={MIN_DIMENSION}
                    max={MAX_DIMENSION}
                    value={rows}
                    onChange={(event) =>
                      handleResize(
                        Number(event.target.value),
                        columns
                      )
                    }
                    className="w-full rounded-lg border border-slate-700 bg-[#080D1B] px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                </label>

                <label className="space-y-2 text-sm">
                  <span className="text-slate-400">
                    Columns
                  </span>

                  <input
                    type="number"
                    min={MIN_DIMENSION}
                    max={MAX_DIMENSION}
                    value={columns}
                    onChange={(event) =>
                      handleResize(
                        rows,
                        Number(event.target.value)
                      )
                    }
                    className="w-full rounded-lg border border-slate-700 bg-[#080D1B] px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                </label>

              </div>

              <p className="mt-2 text-xs text-slate-500">
                Minimum 5 × 5. Maximum 200 × 200.
              </p>
            </div>

            {/* Conversion settings */}
            <div className="border-t border-slate-800 pt-5">
              <h2 className="text-lg font-semibold">
                3. Conversion
              </h2>

              <div className="mt-3 rounded-lg bg-slate-900 p-3">

                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded border border-slate-600 bg-black" />
                  <span className="text-sm">
                    Black squares
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="h-7 w-7 rounded border border-slate-500 bg-white" />
                  <span className="text-sm">
                    White squares
                  </span>
                </div>

                <p className="mt-3 text-xs text-blue-300">
                  Automatic thresholding · Strictly 2 colours
                </p>
              </div>
            </div>

            {/* Grid line toggle */}
            <div className="border-t border-slate-800 pt-5">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span>Show grid lines</span>

                <input
                  type="checkbox"
                  checked={showLines}
                  onChange={(event) =>
                    setShowLines(event.target.checked)
                  }
                  className="h-4 w-4 accent-blue-500"
                />
              </label>
            </div>

            {/* Errors */}
            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </p>
            )}

            {/* Loading message */}
            {loading && (
              <p className="text-sm text-blue-300">
                Processing your image...
              </p>
            )}

            {/* Regenerate button */}
            <button
              type="button"
              onClick={regenerateGrid}
              disabled={!imageName || loading}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Regenerate grid
            </button>

          </aside>

          {/* RIGHT PANEL */}
          <section className="min-w-0 space-y-5 rounded-2xl border border-slate-800 bg-[#10182B] p-5">

            {/* Preview heading */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  Grid preview
                </h2>

                <p className="text-sm text-slate-400">
                  Click a square to switch its colour.
                </p>
              </div>

              {generated && (
                <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-300">
                  Grid generated
                </span>
              )}
            </div>

            {/* Canvas preview */}
            <div className="flex min-h-[420px] items-center justify-center overflow-auto rounded-xl bg-white p-4">
              {cells.length ? (
                <canvas
                  ref={previewCanvasRef}
                  onClick={toggleCell}
                  title="Click individual squares to edit"
                  className="max-h-[75vh] max-w-full cursor-crosshair object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="text-center text-slate-500">
                  <div className="mb-3 text-5xl">
                    ▦
                  </div>

                  <p className="font-semibold">
                    Your grid will appear here
                  </p>

                  <p className="mt-1 text-sm">
                    Upload an image to get started.
                  </p>
                </div>
              )}
            </div>

            {/* Grid statistics and export actions */}
            {generated && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

                  <div className="rounded-lg bg-slate-900 p-3">
                    <p className="text-xs text-slate-400">
                      Rows
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {rows}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-900 p-3">
                    <p className="text-xs text-slate-400">
                      Columns
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {columns}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-900 p-3">
                    <p className="text-xs text-slate-400">
                      Black stitches
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {blackCount}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-900 p-3">
                    <p className="text-xs text-slate-400">
                      White stitches
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {whiteCount}
                    </p>
                  </div>

                </div>

                {/* Download, print and reset */}
                <div className="flex flex-wrap gap-3">

                  <button
                    type="button"
                    onClick={downloadPNG}
                    className="flex-1 rounded-xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500"
                  >
                    Download PNG
                  </button>

                  <button
                    type="button"
                    onClick={printPattern}
                    className="flex-1 rounded-xl border border-slate-600 px-4 py-3 font-semibold hover:bg-slate-800"
                  >
                    Print / Save PDF
                  </button>

                  <button
                    type="button"
                    onClick={resetGrid}
                    className="rounded-xl border border-slate-700 px-4 py-3 text-slate-300 hover:bg-slate-800"
                  >
                    Reset
                  </button>

                </div>
              </>
            )}

            <p className="text-xs leading-5 text-slate-500">
              Note: Each grid square represents one stitch.
              The actual finished dimensions depend on your
              yarn, hook size and personal tension. Make a
              gauge swatch before estimating the finished size.
            </p>

          </section>
        </section>
      </div>

      {/* Print styling */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }

          body * {
            visibility: hidden;
          }

          canvas {
            visibility: visible !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            max-width: none !important;
          }
        }
      `}</style>
    </main>
  );
}
