// cutout — foreground cut-out with Apple's Vision framework (macOS 14+). Writes a PNG with alpha where the background was.
// Contract: see README.md "cutout". Build once: `swiftc -O -o tools/cutout tools/cutout.swift`. Usage: tools/cutout <in> <out.png>
// Runs locally; no image leaves the machine. Exit 2 usage, 1 when nothing is read or no foreground is found.
import Foundation
import Vision
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count == 3 else { fputs("usage: cutout <in> <out.png>\n", stderr); exit(2) }
let url = URL(fileURLWithPath: args[1])
guard let ci = CIImage(contentsOf: url) else { fputs("cannot read \(args[1])\n", stderr); exit(1) }
let handler = VNImageRequestHandler(ciImage: ci, options: [:])
let request = VNGenerateForegroundInstanceMaskRequest()
do { try handler.perform([request]) } catch { fputs("vision failed: \(error)\n", stderr); exit(1) }
guard let result = request.results?.first else { fputs("no foreground found\n", stderr); exit(1) }
let buffer = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: false)
let out = CIImage(cvPixelBuffer: buffer)
let ctx = CIContext()
guard let png = ctx.pngRepresentation(of: out, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!) else { fputs("png failed\n", stderr); exit(1) }
try png.write(to: URL(fileURLWithPath: args[2]))
print("ok \(args[2]) instances=\(result.allInstances.count)")
