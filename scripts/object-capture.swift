// Reconstruct a textured mesh from a folder of photos or video frames with
// Apple's Object Capture (RealityKit photogrammetry, macOS 12+ on Apple silicon).
//
//   swiftc -O scripts/object-capture.swift -o /tmp/object-capture
//   /tmp/object-capture <images-folder> <output-folder> [reduced|medium|full] [sequential|unordered]
//
// The output folder receives an OBJ + MTL + texture PNGs, which
// scripts/build-splat.mjs --obj turns into the banner's splat file.
import Foundation
import RealityKit

let args = CommandLine.arguments
guard args.count >= 3 else {
    print("usage: object-capture <images-folder> <output-folder> [reduced|medium|full] [sequential|unordered]")
    exit(1)
}
let input = URL(fileURLWithPath: args[1], isDirectory: true)
let output = URL(fileURLWithPath: args[2], isDirectory: true)
try? FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

let detail: PhotogrammetrySession.Request.Detail = {
    switch args.count > 3 ? args[3] : "medium" {
    case "reduced": return .reduced
    case "full": return .full
    default: return .medium
    }
}()

var config = PhotogrammetrySession.Configuration()
config.sampleOrdering = (args.count > 4 ? args[4] : "sequential") == "unordered" ? .unordered : .sequential
config.featureSensitivity = .high
config.isObjectMaskingEnabled = true

guard PhotogrammetrySession.isSupported else {
    print("Object Capture isn't supported on this Mac")
    exit(1)
}

let session = try PhotogrammetrySession(input: input, configuration: config)

Task {
    do {
        for try await message in session.outputs {
            switch message {
            case .requestProgress(_, let fraction):
                print(String(format: "progress %.0f%%", fraction * 100))
            case .requestComplete(_, let result):
                print("complete: \(result)")
            case .requestError(_, let error):
                print("error: \(error)")
                exit(2)
            case .processingComplete:
                print("done")
                exit(0)
            case .inputComplete:
                print("input read")
            case .invalidSample(let id, let reason):
                print("invalid sample \(id): \(reason)")
            case .skippedSample(let id):
                print("skipped sample \(id)")
            case .automaticDownsampling:
                print("automatic downsampling")
            case .processingCancelled:
                print("cancelled")
                exit(3)
            default:
                break
            }
        }
    } catch {
        print("session failed: \(error)")
        exit(4)
    }
}

try session.process(requests: [.modelFile(url: output, detail: detail)])
RunLoop.main.run()
