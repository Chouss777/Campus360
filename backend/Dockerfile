FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -ntp -DskipTests package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S campus360 && adduser -S campus360 -G campus360
RUN mkdir /app/uploads && chown campus360:campus360 /app/uploads
COPY --from=build /app/target/*.jar /app/campus360.jar
USER campus360
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/campus360.jar"]
