#!/usr/bin/env python3
"""JSON-in/JSON-out adapter for local MLX text embeddings."""

import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    payload = json.load(sys.stdin)
    texts = payload.get("texts")
    if not isinstance(texts, list) or not all(isinstance(text, str) for text in texts):
        raise ValueError("texts must be an array of strings")

    from mlx_embeddings.utils import load

    model, tokenizer = load(args.model)
    inputs = tokenizer.batch_encode_plus(
        texts,
        return_tensors="mlx",
        padding=True,
        truncation=True,
        max_length=512,
    )
    outputs = model(inputs["input_ids"], attention_mask=inputs["attention_mask"])
    print(json.dumps({"embeddings": outputs.text_embeds.tolist()}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"MLX embedding error: {exc}", file=sys.stderr)
        raise SystemExit(1)
