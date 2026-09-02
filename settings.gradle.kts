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
    ":apps:fieldops-api",
    ":apps:ingestion-gateway",
    ":apps:telemetry-worker",
    ":apps:automation-worker",
    ":apps:billing-job",
    ":apps:simulator",
    ":modules:common-kernel",
    ":modules:tenancy",
    ":modules:registry",
    ":modules:telemetry-domain",
    ":modules:telemetry-application",
    ":modules:telemetry-infrastructure",
    ":modules:state-projection",
    ":modules:rule-engine",
    ":modules:alarm-incident",
    ":modules:command-domain",
    ":modules:command-application",
    ":modules:ai-operations",
    ":modules:usage-billing",
    ":modules:audit",
    ":modules:observability"
)
