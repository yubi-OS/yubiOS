"""Draw field points and cell-level departures from exchangeable family labels."""

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.colors import Normalize
from matplotlib.cm import ScalarMappable
import numpy as np

COLORS = ["#0072b2", "#d55e00", "#009e73", "#cc79a7", "#6b4c9a", "#a06b00"]


def atlas(report, labels, ref, path):
    families = report["families"]
    panels = report["states"]
    names = list(panels["native"]["views"])
    fig, axes = plt.subplots(4, 4, figsize=(14, 12))
    fig.subplots_adjust(
        top=0.865, left=0.08, right=0.94, bottom=0.15, wspace=0.25, hspace=0.39
    )
    fig.suptitle(
        "Where ontology families occupy the embedding field", fontsize=22, y=0.98
    )
    handles = [
        Line2D([], [], marker="o", ls="", color=c, label=f)
        for f, c in zip(families, COLORS)
    ]
    fig.legend(
        handles=handles,
        loc="upper center",
        bbox_to_anchor=(0.5, 0.951),
        ncol=6,
        frameon=False,
    )
    all_cells = [
        c["z"]
        for state in panels.values()
        for p in state["views"].values()
        for c in p["cells"]
        if c["z"] is not None
    ]
    limit = max([abs(z) for z in all_cells], default=1) or 1
    norm = Normalize(-limit, limit)
    cmap = plt.get_cmap("RdBu_r").copy()
    cmap.set_bad("#e6e8ea")
    for j, view in enumerate(names):
        for i, state in enumerate(("native", "powered")):
            panel = panels[state]["views"][view]
            coords = np.asarray(panel["xy"])
            lx, ly = panel["limits"]
            ax = axes[i, j]
            for f, c in zip(families, COLORS):
                for part, fill in ((ref, "none"), (~ref, c)):
                    mask = (labels == f) & part
                    ax.scatter(
                        *coords[mask].T,
                        s=22,
                        facecolors=fill,
                        edgecolors=c,
                        linewidths=0.85,
                        alpha=0.75 if fill == "none" else 0.95,
                    )
            res = axes[i + 2, j]
            cells = np.array(
                [np.nan if c["z"] is None else c["z"] for c in panel["cells"]]
            ).reshape(4, 4)
            res.imshow(
                cells,
                origin="lower",
                extent=(-lx, lx, -ly, ly),
                cmap=cmap,
                norm=norm,
                interpolation="nearest",
                aspect="auto",
            )
            for box in (ax, res):
                box.set(xlim=(-lx, lx), ylim=(-ly, ly))
                box.tick_params(labelsize=8)
            if not i:
                ax.set_title(view, fontsize=12)
            if not j:
                ax.set_ylabel(state.capitalize() + " points")
                res.set_ylabel(state.capitalize() + " null residual")
    bar = fig.add_axes([0.34, 0.085, 0.32, 0.014])
    fig.colorbar(
        ScalarMappable(norm=norm, cmap=cmap),
        cax=bar,
        orientation="horizontal",
        label="Same-family pair excess in cell (signed z)",
    )
    fig.text(
        0.5,
        0.014,
        "48 reference definitions (open) and 48 field definitions (filled). Sphere axes: longitude / π and sin(latitude). Gray: zero null spread.",
        ha="center",
        fontsize=10,
    )
    fig.savefig(path, dpi=135, facecolor="white")
    plt.close(fig)


def globes(report, labels, ref, path):
    fig = plt.figure(figsize=(11, 6.6))
    fig.suptitle("Two fixed PCA spheres, before and after lensing", fontsize=18)
    fig.subplots_adjust(top=0.89, bottom=0.08, wspace=0.12, hspace=0.08)
    for i, state in enumerate(("native", "powered")):
        for j, name in enumerate(("PC1-3 sphere", "PC4-6 sphere")):
            ax = fig.add_subplot(2, 2, 1 + 2 * i + j, projection="3d")
            lon, z = np.array(report["states"][state]["views"][name]["xy"]).T
            radius = np.sqrt(np.maximum(0, 1 - z * z))
            xyz = np.vstack(
                [radius * np.cos(np.pi * lon), radius * np.sin(np.pi * lon), z]
            )
            u, v = np.meshgrid(np.linspace(0, 2 * np.pi, 17), np.linspace(0, np.pi, 9))
            ax.plot_wireframe(
                np.cos(u) * np.sin(v),
                np.sin(u) * np.sin(v),
                np.cos(v),
                color="#c6cbd0",
                lw=0.45,
                alpha=0.6,
            )
            for f, c in zip(report["families"], COLORS):
                for part, fill in ((ref, "none"), (~ref, c)):
                    mask = (labels == f) & part
                    ax.scatter(
                        *xyz[:, mask],
                        facecolors=fill,
                        edgecolors=c,
                        s=20,
                        depthshade=False,
                    )
            ax.set_box_aspect((1, 1, 1))
            ax.view_init(18, -60)
            ax.set_axis_off()
            ax.set_title(f"{state.capitalize()} · {name}", fontsize=11, pad=-1)
    handles = [
        Line2D([], [], marker="o", ls="", color=c, label=f)
        for f, c in zip(report["families"], COLORS)
    ]
    fig.legend(handles=handles, loc="lower center", ncol=6, frameon=False)
    fig.savefig(path, dpi=135, bbox_inches="tight", facecolor="white")
    plt.close(fig)
