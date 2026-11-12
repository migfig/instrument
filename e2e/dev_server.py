"""E2E dev backend: a tiny CPU model served exactly like the real server.
The walkthrough judges need a live model, not the 4.3 GB checkpoint."""
import sys
from pathlib import Path

import torch
import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from instruments.mem import ModelConfig  # noqa: E402
from llm.model import Model  # noqa: E402
from tokenizer.tokenizer import Tokenizer  # noqa: E402
from serve.server import Engine, build_app  # noqa: E402


def main():
    mc = ModelConfig(2, 128, 4, 4, 512, 50257, tie_weights=True)
    torch.manual_seed(0)
    model = Model(mc).float().cpu().eval()
    engine = Engine(model, "tiny", Tokenizer(), device="cpu", is_gpt2=False,
                    max_model_len=1024)
    log = Path(__file__).parent / "e2e-requests.jsonl"
    app = build_app(engine, "tiny", log)
    uvicorn.run(app, host="127.0.0.1", port=8100, log_level="warning")


if __name__ == "__main__":
    main()
