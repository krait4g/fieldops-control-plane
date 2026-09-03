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
    ":apps:billing-job",
    ":apps:simulator",
    ":modules:common-kernel",
    ":modules:tenancy",
    ":modules:registry",
    ":modules:device-integration",
    ":modules:telemetry-domain",
    ":modules:telemetry-application",
    ":modules:telemetry-infrastructure",
    ":modules:state-projection",
    ":modules:dashboard-query",
    ":modules:camera-control",
    ":modules:rule-engine",
    ":modules:alarm-incident",
    ":modules:command-domain",
    ":modules:command-application",
    ":modules:ai-operations",
    ":modules:usage-billing",
    ":modules:audit",
    ":modules:observability"
)
