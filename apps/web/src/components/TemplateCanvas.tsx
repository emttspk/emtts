import { useEffect, useMemo, useRef } from "react";
import { Layer, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import Card from "./Card";

type FieldType = "text" | "barcode" | "box" | "date" | "amount";

type MoneyOrderTemplateField = {
  id: string;
  templateId: string;
  fieldKey: string;
  fieldType: FieldType;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: "normal" | "bold";
  rotation: number;
  isLocked: boolean;
};

type MoneyOrderTemplate = {
  id: string;
  name: string;
  backgroundUrl: string | null;
  version: number;
  isActive: boolean;
  fields: MoneyOrderTemplateField[];
};

function useImageElement(url: string | null) {
  const image = useMemo(() => {
    if (!url) return null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    return img;
  }, [url]);

  return image;
}

function fieldLabel(field: MoneyOrderTemplateField, value?: string) {
  if (field.fieldType === "barcode") return `[BARCODE] ${value ?? field.fieldKey}`;
  if (field.fieldType === "date") return value ?? "2026-04-28";
  if (field.fieldType === "amount") return value ?? "7500";
  if (field.fieldType === "box") return "";
  return value ?? field.fieldKey;
}

export default function TemplateCanvas(props: {
  template: MoneyOrderTemplate | null;
  previewMode: boolean;
  selectedFieldId: string | null;
  previewValues: Record<string, string>;
  onSelectField: (fieldId: string | null) => void;
  onUpdateField: (fieldId: string, patch: Partial<MoneyOrderTemplateField>) => Promise<void>;
}) {
  const image = useImageElement(props.template?.backgroundUrl ?? null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const shapeRefs = useRef<Record<string, Konva.Rect | null>>({});

  useEffect(() => {
    if (!transformerRef.current || !props.selectedFieldId || props.previewMode) {
      transformerRef.current?.nodes([]);
      return;
    }

    const node = shapeRefs.current[props.selectedFieldId];
    if (node) {
      transformerRef.current.nodes([node]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [props.selectedFieldId, props.previewMode, props.template?.fields]);

  if (!props.template) {
    return <Card className="p-6 text-sm text-slate-600">Create or select a template to start designing.</Card>;
  }

  return (
    <Card className="overflow-auto p-4">
      <div className="mb-3 text-sm text-slate-600">
        Canvas: {props.template.name} {props.previewMode ? "(Preview)" : "(Edit)"}
      </div>
      <div className="min-w-[920px]">
        <Stage width={900} height={1200} className="rounded-2xl border border-slate-200 bg-white">
          <Layer>
            <Rect x={0} y={0} width={900} height={1200} fill="#ffffff" />
            {image ? (
              <Rect
                x={0}
                y={0}
                width={900}
                height={1200}
                fillPatternImage={image}
                fillPatternScale={{
                  x: image.width > 0 ? 900 / image.width : 1,
                  y: image.height > 0 ? 1200 / image.height : 1,
                }}
              />
            ) : (
              <Text x={24} y={24} fontSize={16} fill="#64748b" text="Upload a background to start layouting the template." />
            )}
          </Layer>

          <Layer>
            {props.template.fields.map((field) => (
              <Rect
                key={field.id}
                ref={(node) => {
                  shapeRefs.current[field.id] = node;
                }}
                x={field.x}
                y={field.y}
                width={field.width}
                height={field.height}
                rotation={field.rotation}
                stroke={field.id === props.selectedFieldId ? "#0f172a" : "#16a34a"}
                strokeWidth={field.id === props.selectedFieldId ? 2 : 1}
                fill={field.fieldType === "box" ? "rgba(34,197,94,0.12)" : "rgba(14,165,233,0.08)"}
                dash={field.fieldType === "box" ? [] : [6, 6]}
                draggable={!field.isLocked && !props.previewMode}
                onClick={() => props.onSelectField(field.id)}
                onTap={() => props.onSelectField(field.id)}
                onDragEnd={(event) => {
                  void props.onUpdateField(field.id, {
                    x: Number(event.target.x().toFixed(2)),
                    y: Number(event.target.y().toFixed(2)),
                  });
                }}
                onTransformEnd={(event) => {
                  const node = event.target;
                  const scaleX = node.scaleX();
                  const scaleY = node.scaleY();
                  node.scaleX(1);
                  node.scaleY(1);
                  void props.onUpdateField(field.id, {
                    x: Number(node.x().toFixed(2)),
                    y: Number(node.y().toFixed(2)),
                    width: Number(Math.max(20, node.width() * scaleX).toFixed(2)),
                    height: Number(Math.max(20, node.height() * scaleY).toFixed(2)),
                    rotation: Number(node.rotation().toFixed(2)),
                  });
                }}
              />
            ))}

            {props.template.fields.map((field) => (
              <Text
                key={`${field.id}_label`}
                x={field.x + 6}
                y={field.y + 8}
                width={Math.max(20, field.width - 12)}
                height={Math.max(20, field.height - 12)}
                rotation={field.rotation}
                text={fieldLabel(field, props.previewValues[field.fieldKey])}
                fontSize={field.fontSize}
                fontStyle={field.fontWeight === "bold" ? "bold" : "normal"}
                fill={props.previewMode ? "#0f172a" : "#0f766e"}
                listening={false}
              />
            ))}

            {!props.previewMode ? (
              <Transformer
                ref={transformerRef}
                rotateEnabled
                enabledAnchors={[
                  "top-left",
                  "top-center",
                  "top-right",
                  "middle-left",
                  "middle-right",
                  "bottom-left",
                  "bottom-center",
                  "bottom-right",
                ]}
                boundBoxFunc={(_oldBox, newBox) => {
                  if (newBox.width < 20 || newBox.height < 20) return _oldBox;
                  return newBox;
                }}
              />
            ) : null}
          </Layer>
        </Stage>
      </div>
    </Card>
  );
}
