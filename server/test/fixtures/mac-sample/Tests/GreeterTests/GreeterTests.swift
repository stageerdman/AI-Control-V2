import XCTest
@testable import Greeter

final class GreeterTests: XCTestCase {
    func testGreetsByName() {
        XCTAssertEqual(greeting(for: " Ada "), "Hello, Ada!")
    }

    func testGreetsNobody() {
        XCTAssertEqual(greeting(for: ""), "Hello!")
    }

    func testViewBuilds() {
        _ = GreetingView(name: "Ada").body
    }
}
