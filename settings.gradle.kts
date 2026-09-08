import org.gradle.api.initialization.resolve.RepositoriesMode

pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
    }
}

rootProject.name = "fieldops-control-plane"

include(
    ":apps:fieldops-server",
    ":apps:device-gateway",
    ":apps:fieldops-worker",
    ":apps:simulator",
    ":modules:telemetry-domain",
    ":modules:telemetry-application"
)
